import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { config } from '../config';
import { getAppWorkflowExportDir, getWorkerDataDir } from '../paths';
import { chapterId, errorMessage, loadPackagedContents, runPool, selectChapters, type PackagedContentRecord } from '../workflow-pipeline';
import { createTtsProgress } from './progress';
import type { AppWorkflow } from '../../../shared/app-workflow';
import type { AppWorkflowActivity } from '../../../shared/app-workflow-activity';
import { PACES, VOICES } from '../../../shared/workflow-activity-format';
export { readTtsOutput, readTtsChapters, readTtsChapterSrt } from './output';

const logger = createLogger('workflow-tts');

interface WorkerSpeech {
  wavPath: string;
  srtPath: string;
}

function chaptersDir(dir: string, language: string): string {
  return path.join(dir, 'audios', language, 'chapters');
}

function wavFile(chaptersDirPath: string, idx: number): string {
  return path.join(chaptersDirPath, `${chapterId(idx)}.wav`);
}

function srtFile(chaptersDirPath: string, idx: number): string {
  return path.join(chaptersDirPath, `${chapterId(idx)}.srt`);
}

/** Parses a pace label like "0.85×" into the numeric factor the worker's `/speech` endpoint expects. */
function paceValue(pace: string): number {
  const value = parseFloat(pace);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * An activity saved before `VOICES`/`PACES` last changed can hold a value neither list offers any
 * more (see the same fallback in `WorkflowActivityInspector`'s Input tab) — falling back here too
 * keeps a stale config from failing the worker's `/speech` call outright.
 */
function resolveVoicePace(voice: string, pace: string): { voice: string; pace: number } {
  const resolvedVoice = VOICES.includes(voice) ? voice : VOICES[0];
  const resolvedPace = PACES.includes(pace) ? pace : PACES[1];
  if (resolvedVoice !== voice || resolvedPace !== pace) {
    logger.warn(`Tts activity's voice '${voice}' / pace '${pace}' is no longer offered — falling back to '${resolvedVoice}' / '${resolvedPace}'`);
  }
  return { voice: resolvedVoice, pace: paceValue(resolvedPace) };
}

/** A chapter's narration text, split into lines — one per srt cue. Reuses the chapter's own text when it's already in the target language, otherwise the Contextual Translation activity's already-translated text (which must have run first). */
function chapterLines(dir: string, language: string, record: PackagedContentRecord): string[] {
  const file = record.language === language ? path.join(dir, record.file!) : path.join(dir, 'translation', language, 'chapters', `${chapterId(record.idx)}.txt`);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found — run the Contextual Translation activity for this language first`);
  }
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

interface SpeechJob {
  id: string;
}

// A whole chapter is synthesized sequentially by the worker in the background, so waiting for it
// needs a bound that scales with how much text there is to speak rather than a flat cap.
const SPEECH_WAIT_FLOOR_MS = 300_000;
const SPEECH_WAIT_PER_LINE_MS = 15_000;
const SPEECH_POLL_INTERVAL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Kicks off synthesis and gets back its job id immediately — the worker runs it in the background rather than holding the request open (see src/worker/app/speech.py). */
async function requestSpeechJob(voice: string, pace: number, texts: string[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${config.scraper.baseUrl}/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice, texts, pace }),
    });
  } catch (error) {
    throw new Error(`Worker speech request failed: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Worker speech request failed with ${response.status}: ${detail || response.statusText}`);
  }
  return ((await response.json()) as SpeechJob).id;
}

/** Polls the worker's shared speech directory for the job's `<id>.wav` (done, with `<id>.srt` already alongside it) or `<id>.error` (failed). */
async function awaitSpeechJob(id: string, lineCount: number): Promise<WorkerSpeech> {
  const speechDir = path.join(getWorkerDataDir(), 'speech');
  const wavPath = path.join(speechDir, `${id}.wav`);
  const errorPath = path.join(speechDir, `${id}.error`);
  const deadline = Date.now() + Math.max(SPEECH_WAIT_FLOOR_MS, lineCount * SPEECH_WAIT_PER_LINE_MS);

  while (!fs.existsSync(wavPath)) {
    if (fs.existsSync(errorPath)) {
      throw new Error(`Worker speech generation failed: ${fs.readFileSync(errorPath, 'utf8')}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Worker speech generation timed out for ${lineCount} line(s)`);
    }
    await sleep(SPEECH_POLL_INTERVAL_MS);
  }

  return { wavPath: `speech/${id}.wav`, srtPath: `speech/${id}.srt` };
}

async function synthesizeSpeech(voice: string, pace: number, texts: string[]): Promise<WorkerSpeech> {
  const id = await requestSpeechJob(voice, pace, texts);
  return awaitSpeechJob(id, texts.length);
}

/** Copies the worker's generated wav+srt — at the `wavPath`/`srtPath` it reported, relative to the shared data dir — into this chapter's own slot in the workflow's export dir, so the Output tab can serve stable per-chapter files. */
function collectSpeechFiles(speech: WorkerSpeech, wavOut: string, srtOut: string): void {
  const sharedDir = getWorkerDataDir();
  fs.copyFileSync(path.join(sharedDir, speech.wavPath), wavOut);
  fs.copyFileSync(path.join(sharedDir, speech.srtPath), srtOut);
}

async function narrateChapter(dir: string, chaptersDirPath: string, language: string, voice: string, pace: number, record: PackagedContentRecord): Promise<void> {
  const wavOut = wavFile(chaptersDirPath, record.idx);
  if (fs.existsSync(wavOut)) {
    return;
  }

  const texts = chapterLines(dir, language, record);
  if (texts.length === 0) {
    logger.warn(`Chapter ${record.idx} has no text to narrate — skipping`);
    return;
  }

  const speech = await synthesizeSpeech(voice, pace, texts);
  collectSpeechFiles(speech, wavOut, srtFile(chaptersDirPath, record.idx));
}

async function runChaptersStep(progress: ReturnType<typeof createTtsProgress>, dir: string, chaptersDirPath: string, language: string, voice: string, pace: number, targets: PackagedContentRecord[]): Promise<void> {
  progress.start('chapters', `0/${targets.length} chapters`);
  let counter = 1;
  try {
    await runPool(targets, 1, async (record) => {
      progress.update('chapters', `${counter++}/${targets.length} chapters`);
      await narrateChapter(dir, chaptersDirPath, language, voice, pace, record);
    });
    progress.done('chapters', `${targets.length} chapter(s)`);
  } catch (error) {
    progress.fail('chapters', errorMessage(error));
    throw error;
  }
}

/**
 * Narrates each targeted chapter through the worker's `/speech` endpoint (see src/worker/app/speech.py),
 * one line of text at a time so the returned srt times every line individually, then collects the
 * result into this chapter's slot under `audios/<language>/chapters/chapter-NNNN.wav` and `.srt`. Driven
 * directly by the workflow orchestrator against the activity's exported working directory
 * (`data/workflows/<id>/`). Idempotent like the other pipelines — an existing chapter wav is left
 * alone, so a re-run only narrates what's still missing. Each step's progress is persisted (for the
 * Output tab to poll) and logged as it advances.
 */
export async function runWorkflowTts(workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  const dir = getAppWorkflowExportDir(workflow.id);
  const contentsPath = path.join(dir, 'contents.json');
  if (!fs.existsSync(contentsPath)) {
    logger.warn(`Workflow ${workflow.id} has no exported contents — skipping tts`);
    return;
  }

  const { chapters, voice, pace, language } = activity.ttsConfig!;
  const chaptersDirPath = chaptersDir(dir, language);
  fs.mkdirSync(chaptersDirPath, { recursive: true });

  const records = loadPackagedContents(dir);
  const targets = selectChapters(records, chapters, (record) => !fs.existsSync(wavFile(chaptersDirPath, record.idx)));
  if (targets.length === 0) {
    logger.info(`Workflow ${workflow.id} has no chapter left to narrate in ${language}`);
    return;
  }
  const resolved = resolveVoicePace(voice, pace);
  logger.info(`Narrating ${targets.length} chapter(s) for workflow ${workflow.id} in ${language} with voice '${resolved.voice}'`);

  const progress = createTtsProgress(workflow.id, activity.id);
  await runChaptersStep(progress, dir, chaptersDirPath, language, resolved.voice, resolved.pace, targets);

  logger.info(`Workflow ${workflow.id} tts finished — ${targets.length} chapter(s) narrated in ${language}`);
}
