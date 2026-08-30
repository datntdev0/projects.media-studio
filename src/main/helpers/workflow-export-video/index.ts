import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { config } from '../config';
import { getAppWorkflowExportDir, getWorkerDataDir } from '../paths';
import { chapterId, errorMessage, loadPackagedContents, runPool, selectChapters, type PackagedContentRecord } from '../workflow-pipeline';
import { chaptersDir, chapterSrtFile, chapterVideoFile, finalSrtFile, finalVideoFile, listChapterIndices } from './output';
import { resolveExportVideoImagePath } from './image-storage';
import { createExportVideoProgress } from './progress';
import { EXPORT_VIDEO_LANGUAGE } from '../../../shared/workflow-activity-format';
import type { AppWorkflow } from '../../../shared/app-workflow';
import type { AppWorkflowActivity } from '../../../shared/app-workflow-activity';
export { readExportVideoOutput, readExportVideoChapters, readExportVideoChapterSrt, readExportVideoSrt } from './output';

const logger = createLogger('workflow-export-video');
const EXPORT_WORKERS = 1;

interface WorkerExport {
  videoPath: string;
  srtPath: string;
}

function ttsChaptersDir(dir: string): string {
  return path.join(dir, 'audios', EXPORT_VIDEO_LANGUAGE, 'chapters');
}

interface ExportJob {
  id: string;
  outputFile: string;
}

// A per-chapter export call muxes a static image + narration into a fresh video, so its wait
// bound is generous per chapter muxed. A combine call is just a stream-copy concat of clips
// already on disk — no re-encode — so it gets its own, much tighter bound.
const EXPORT_WAIT_FLOOR_MS = 120_000;
const EXPORT_WAIT_PER_CHAPTER_MS = 120_000;
const COMBINE_WAIT_FLOOR_MS = 30_000;
const COMBINE_WAIT_PER_CHAPTER_MS = 5_000;
const EXPORT_POLL_INTERVAL_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Posts a job request to the worker and gets back its job id + expected output file name immediately — the worker runs it in the background rather than holding the request open (see src/worker/app/export.py). */
async function postExportJob(endpoint: string, body: unknown): Promise<ExportJob> {
  let response: Response;
  try {
    response = await fetch(`${config.scraper.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Worker export request failed: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Worker export request failed with ${response.status}: ${detail || response.statusText}`);
  }
  return (await response.json()) as ExportJob;
}

/** Polls the worker's shared export directory for the job's `<id>.mp4` (done, with `<id>.srt` already alongside it) or `<id>.error` (failed). */
async function awaitExportJob(outputFile: string, chapterCount: number, waitFloorMs: number, waitPerChapterMs: number): Promise<WorkerExport> {
  const exportDir = path.join(getWorkerDataDir(), 'export');
  const id = outputFile.replace(/\.mp4$/, '');
  const videoPath = path.join(exportDir, outputFile);
  const errorPath = path.join(exportDir, `${id}.error`);
  const deadline = Date.now() + Math.max(waitFloorMs, chapterCount * waitPerChapterMs);

  while (!fs.existsSync(videoPath)) {
    if (fs.existsSync(errorPath)) {
      throw new Error(`Worker export generation failed: ${fs.readFileSync(errorPath, 'utf8')}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Worker export generation timed out for ${chapterCount} chapter(s)`);
    }
    await sleep(EXPORT_POLL_INTERVAL_MS);
  }

  return { videoPath: `export/${outputFile}`, srtPath: `export/${id}.srt` };
}

async function requestChapterExport(workflowId: string, chapterIds: string[], imageFile: string, soundWave: boolean): Promise<WorkerExport> {
  const job = await postExportJob('/export', { workflowId, chapterRange: chapterIds, imageFile, soundWave });
  return awaitExportJob(job.outputFile, chapterIds.length, EXPORT_WAIT_FLOOR_MS, EXPORT_WAIT_PER_CHAPTER_MS);
}

/** Concatenates already-exported chapter clips (paths relative to the shared worker data dir) into one final video via stream copy — no re-encode. */
async function requestCombineExport(chapterVideoFiles: string[]): Promise<WorkerExport> {
  const job = await postExportJob('/export/combine', { chapterVideoFiles });
  return awaitExportJob(job.outputFile, chapterVideoFiles.length, COMBINE_WAIT_FLOOR_MS, COMBINE_WAIT_PER_CHAPTER_MS);
}

/** Copies the worker's generated mp4+srt — at the `videoPath`/`srtPath` it reported, relative to the shared data dir — into their target slot in the workflow's export dir. */
function collectExportFiles(exported: WorkerExport, videoOut: string, srtOut: string): void {
  const sharedDir = getWorkerDataDir();
  fs.copyFileSync(path.join(sharedDir, exported.videoPath), videoOut);
  fs.copyFileSync(path.join(sharedDir, exported.srtPath), srtOut);
}

async function exportChapterVideo(workflowId: string, ttsChaptersDirPath: string, videoChaptersDirPath: string, imageFile: string, soundWave: boolean, record: PackagedContentRecord): Promise<void> {
  const videoOut = chapterVideoFile(videoChaptersDirPath, record.idx);
  if (fs.existsSync(videoOut)) {
    return;
  }

  const cid = chapterId(record.idx);
  const wavPath = path.join(ttsChaptersDirPath, `${cid}.wav`);
  const srtPath = path.join(ttsChaptersDirPath, `${cid}.srt`);
  if (!fs.existsSync(wavPath) || !fs.existsSync(srtPath)) {
    throw new Error(`${wavPath} not found — run the Text-to-Speech activity for Vietnamese first`);
  }

  const exported = await requestChapterExport(workflowId, [cid], imageFile, soundWave);
  collectExportFiles(exported, videoOut, chapterSrtFile(videoChaptersDirPath, record.idx));
}

async function runChaptersStep(progress: ReturnType<typeof createExportVideoProgress>, workflowId: string, ttsChaptersDirPath: string, videoChaptersDirPath: string, imageFile: string, soundWave: boolean, targets: PackagedContentRecord[]): Promise<void> {
  if (targets.length === 0) {
    progress.done('chapters', 'no chapter to export');
    return;
  }

  progress.start('chapters', `0/${targets.length} chapters`);
  let counter = 1;
  try {
    await runPool(targets, EXPORT_WORKERS, async (record) => {
      progress.update('chapters', `${counter++}/${targets.length} chapters`);
      await exportChapterVideo(workflowId, ttsChaptersDirPath, videoChaptersDirPath, imageFile, soundWave, record);
    });
    progress.done('chapters', `${targets.length} chapter(s)`);
  } catch (error) {
    progress.fail('chapters', errorMessage(error));
    throw error;
  }
}

/**
 * Combines every chapter clip exported so far (not just this run's targets — the accumulated,
 * resumable coverage) into one final video by concatenating the already-muxed clips via stream
 * copy — no re-encode. Left alone if a final video already exists.
 */
async function runCombineStep(progress: ReturnType<typeof createExportVideoProgress>, workflowId: string, activityId: string, videoChaptersDirPath: string): Promise<void> {
  const finalVideo = finalVideoFile(workflowId, activityId);
  if (fs.existsSync(finalVideo)) {
    progress.done('combine', 'already combined');
    return;
  }

  const indices = listChapterIndices(videoChaptersDirPath);
  if (indices.length === 0) {
    progress.done('combine', 'no chapter exported yet');
    return;
  }

  progress.start('combine', `${indices.length} chapter(s)`);
  try {
    const sharedDir = getWorkerDataDir();
    const chapterVideoFiles = indices.map((idx) => path.relative(sharedDir, chapterVideoFile(videoChaptersDirPath, idx)).split(path.sep).join('/'));
    const exported = await requestCombineExport(chapterVideoFiles);
    collectExportFiles(exported, finalVideo, finalSrtFile(workflowId, activityId));
    progress.done('combine', `${indices.length} chapter(s)`);
  } catch (error) {
    progress.fail('combine', errorMessage(error));
    throw error;
  }
}

/**
 * Exports each targeted chapter through the worker's `/export` endpoint (see src/worker/app/export.py)
 * into its own clip under `exports/<activityId>/chapters/chapter-NNNN.mp4` — resumable, an
 * existing chapter clip is left alone — then combines every clip exported so far into one final
 * video at `exports/<activityId>/final.mp4` via the worker's `/export/combine` endpoint, a
 * stream-copy concat with a unified srt (no re-encode). Driven directly by the workflow
 * orchestrator against the activity's exported working directory (`data/workflows/<id>/`).
 */
export async function runWorkflowExportVideo(workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  const dir = getAppWorkflowExportDir(workflow.id);
  const contentsPath = path.join(dir, 'contents.json');
  if (!fs.existsSync(contentsPath)) {
    logger.warn(`Workflow ${workflow.id} has no exported contents — skipping export video`);
    return;
  }

  const { chapters, imageFile, soundWave } = activity.exportVideoConfig!;
  const imagePath = resolveExportVideoImagePath(imageFile);
  if (!imagePath || !fs.existsSync(imagePath)) {
    logger.warn(`Export Video activity ${activity.id} has no image uploaded — skipping`);
    return;
  }

  const ttsChaptersDirPath = ttsChaptersDir(dir);
  const videoChaptersDirPath = chaptersDir(workflow.id, activity.id);
  fs.mkdirSync(videoChaptersDirPath, { recursive: true });

  const records = loadPackagedContents(dir);
  const targets = selectChapters(records, chapters, (record) => !fs.existsSync(chapterVideoFile(videoChaptersDirPath, record.idx)));

  const workerImageFile = path.relative(getWorkerDataDir(), imagePath).split(path.sep).join('/');

  const progress = createExportVideoProgress(workflow.id, activity.id);
  await runChaptersStep(progress, workflow.id, ttsChaptersDirPath, videoChaptersDirPath, workerImageFile, soundWave, targets);
  await runCombineStep(progress, workflow.id, activity.id, videoChaptersDirPath);

  logger.info(`Workflow ${workflow.id} export video finished for activity ${activity.id}`);
}
