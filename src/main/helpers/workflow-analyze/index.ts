import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { getAppWorkflowExportDir } from '../paths';
import { createUsageAccumulator, runLlmPrint, type LlmUsage } from '../llm-cli';
import { mergeWorld } from './merge';
import { renderGlossaryMarkdown } from './render';
import { createAnalyzeProgress, type AnalyzeProgressTracker } from './progress';
import { CHAPTER_SCHEMA, CHAPTER_TEMPLATE, RESOLVE_SCHEMA } from './schemas';
import type { ChapterExtraction, ConflictResolution, WorldBible } from './types';
import { ActivityChapterScope, AnalyzeEngine, type ChapterSelection } from '../../../shared/app-workflow-activity';
import { AppLibraryContentType } from '../../../shared/app-library-content';
import type { AppWorkflow } from '../../../shared/app-workflow';
import type { AppWorkflowActivity } from '../../../shared/app-workflow-activity';
export { readAnalyzeOutput, readAnalyzeCharacters, readAnalyzeGlossary, readAnalyzeTimeline } from './output';
export { readAnalyzeProgress } from './progress';

const logger = createLogger('workflow-analyze');
const EXTRACT_WORKERS = 1;
const EXTRACT_TIMEOUT_MS = 300_000;
const RESOLVE_TIMEOUT_MS = 600_000;

interface PackagedContentRecord {
  id: string;
  idx: number;
  type: string;
  language: string;
  title: string;
  file: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function chapterFile(extractionDir: string, idx: number): string {
  return path.join(extractionDir, `chapter-${String(idx).padStart(4, '0')}.json`);
}

/** Which exported original chapters an activity's `chapters` selection covers — resolved purely from the working directory's `contents.json`, the same manifest the export step wrote. */
function selectChapters(records: PackagedContentRecord[], chapters: ChapterSelection, extractionDir: string): PackagedContentRecord[] {
  const originals = records.filter((record) => record.type === AppLibraryContentType.Original && record.file);
  switch (chapters.scope) {
    case ActivityChapterScope.All:
      return originals;
    case ActivityChapterScope.Range:
      return originals.filter((record) => record.idx >= chapters.rangeFrom && record.idx <= chapters.rangeTo);
    case ActivityChapterScope.Picked:
      return originals.filter((record) => chapters.pickedContentIds.includes(record.id));
    case ActivityChapterScope.Missing:
      return originals.filter((record) => !fs.existsSync(chapterFile(extractionDir, record.idx)));
  }
}

async function runPool<T>(items: T[], workers: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lane = async (): Promise<void> => {
    while (cursor < items.length) {
      await task(items[cursor++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, lane));
}

function buildExtractPrompt(chapterId: string, title: string, language: string, text: string): string {
  return `You are extracting world-bible data from one chapter of a novel, for later merging across the whole book.

Chapter id: ${chapterId}
Chapter title: ${title}
Language: ${language} (keep every string in this language, do not translate)

Chapter text:
---
${text}
---

Split the chapter into scenes: a scene is a continuous stretch of one place/time. Most chapters are a single scene, only split on a clear jump in location, time, or point of view. Scene ids are "${chapterId}-scene-0001", "${chapterId}-scene-0002", and so on.

Fill in:
- overview.summary: one or two sentence summary of the chapter.
- overview.glossary: every proper noun introduced or explained in this chapter (place, item, technique, faction, rank, title) with term/category/definition.
- characters: every named character appearing or referenced, with aliases used for them, appearance keyed by scene id (only scenes where something physical is actually described, omit the rest), and relationships to other named characters as of this point in the story.
- timeline: one entry per scene with idx/summary/participants/location.

The example below (in a different language, structure only) shows the exact shape to follow:
${JSON.stringify(CHAPTER_TEMPLATE, null, 2)}

Return only the JSON object.`;
}

async function extractChapter(engine: AnalyzeEngine, dir: string, extractionDir: string, record: PackagedContentRecord, onUsage: (usage: LlmUsage) => void): Promise<void> {
  const outFile = chapterFile(extractionDir, record.idx);
  if (fs.existsSync(outFile)) {
    return;
  }

  const chapterId = `chapter-${String(record.idx).padStart(4, '0')}`;
  const text = fs.readFileSync(path.join(dir, record.file!), 'utf8');
  const prompt = buildExtractPrompt(chapterId, record.title, record.language, text);
  const data = await runLlmPrint(engine, prompt, { schema: CHAPTER_SCHEMA, timeoutMs: EXTRACT_TIMEOUT_MS, onUsage });
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');
}

async function runExtractStep(progress: AnalyzeProgressTracker, engine: AnalyzeEngine, dir: string, extractionDir: string, targets: PackagedContentRecord[], onUsage: (usage: LlmUsage) => void): Promise<void> {
  progress.start('extract', `0/${targets.length} chapters`);
  let completed = 0;
  try {
    await runPool(targets, EXTRACT_WORKERS, async (record) => {
      await extractChapter(engine, dir, extractionDir, record, onUsage);
      completed += 1;
      if (completed < targets.length) {
        progress.update('extract', `${completed}/${targets.length} chapters`);
      }
    });
  } catch (error) {
    progress.fail('extract', errorMessage(error));
    throw error;
  }
  progress.done('extract', `${completed}/${targets.length} chapters`);
}

function loadChapters(extractionDir: string): ChapterExtraction[] {
  return fs
    .readdirSync(extractionDir)
    .filter((file) => /^chapter-\d{4}\.json$/.test(file))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(extractionDir, file), 'utf8')) as ChapterExtraction);
}

async function runMergeStep(progress: AnalyzeProgressTracker, engine: AnalyzeEngine, chapters: ChapterExtraction[], onUsage: (usage: LlmUsage) => void): Promise<WorldBible> {
  progress.start('merge', `${chapters.length} chapter(s)`);
  try {
    const world = await mergeWorld(engine, chapters, onUsage);
    progress.done('merge', `${chapters.length} chapter(s)`);
    return world;
  } catch (error) {
    progress.fail('merge', errorMessage(error));
    throw error;
  }
}

function resolvePrompt(worldJson: string): string {
  return `Here is a novel's merged world bible (characters, glossary, timeline), built by merging per-chapter extractions:

${worldJson}

Find every critical or high severity conflict or confusion in it:
- a character described or named inconsistently
- a glossary term defined two different ways
- a timeline entry that cannot follow from the scene before it

Resolve each one directly in the data: prefer the version supported by more scenes, or the most recent one if the story clearly changed it over time. 
Do not invent facts that are not present anywhere in the data. Keep every string in its original language, do not translate. Keep the exact same JSON shape as the input.

Return the corrected world object under "world", and under "resolutions" one entry per conflict you fixed, with "issue" (what was wrong, naming the relevant chapter/scene ids) and "resolution" (what you changed and why). 
If there are no conflicts, return the world unchanged and an empty resolutions list. Skip minor style variation — only critical/high severity conflicts are worth touching.`;
}

async function runResolveStep(progress: AnalyzeProgressTracker, engine: AnalyzeEngine, merged: WorldBible, onUsage: (usage: LlmUsage) => void): Promise<{ world: WorldBible; resolutions: ConflictResolution[] }> {
  progress.start('resolve');
  try {
    const prompt = resolvePrompt(JSON.stringify(merged, null, 2));
    const result = (await runLlmPrint(engine, prompt, { schema: RESOLVE_SCHEMA, timeoutMs: RESOLVE_TIMEOUT_MS, onUsage })) as { world: WorldBible; resolutions: ConflictResolution[] };
    progress.done('resolve', `${result.resolutions.length} conflict(s) resolved`);
    return result;
  } catch (error) {
    progress.fail('resolve', errorMessage(error));
    throw error;
  }
}

function renderConflictsMarkdown(resolutions: ConflictResolution[]): string {
  const lines = ['# Conflict Resolutions', ''];
  if (resolutions.length === 0) {
    lines.push('No critical or high severity conflicts found.');
  } else {
    for (const item of resolutions) {
      lines.push(`- **${item.issue}** — ${item.resolution}`);
    }
  }
  return lines.join('\n') + '\n';
}

function runRenderStep(progress: AnalyzeProgressTracker, extractionDir: string, world: WorldBible, resolutions: ConflictResolution[], chaptersCovered: number): void {
  progress.start('render');
  try {
    fs.writeFileSync(path.join(extractionDir, 'world.json'), JSON.stringify(world, null, 2), 'utf8');
    fs.writeFileSync(path.join(extractionDir, 'conflicts.md'), renderConflictsMarkdown(resolutions), 'utf8');
    fs.writeFileSync(path.join(extractionDir, 'glossary.md'), renderGlossaryMarkdown(world), 'utf8');
    fs.writeFileSync(path.join(extractionDir, 'stats.json'), JSON.stringify({ chaptersCovered, conflictsResolved: resolutions.length }), 'utf8');
    progress.done('render');
  } catch (error) {
    progress.fail('render', errorMessage(error));
    throw error;
  }
}

/**
 * Extract → merge → resolve → render, driven directly by the workflow orchestrator against the
 * activity's exported working directory (`data/workflows/<id>/`). Extraction is idempotent per
 * chapter — an existing `extraction/chapter-NNNN.json` is left alone — so a re-run only fills in
 * gaps, and merge/resolve/render always rebuild the world bible from every chapter extracted so
 * far, not just the ones this run added. Each step's progress is persisted (for the Output tab to
 * poll) and logged as it advances.
 */
export async function runWorkflowAnalyze(workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  const dir = getAppWorkflowExportDir(workflow.id);
  const contentsPath = path.join(dir, 'contents.json');
  if (!fs.existsSync(contentsPath)) {
    logger.warn(`Workflow ${workflow.id} has no exported contents — skipping analyze`);
    return;
  }

  const extractionDir = path.join(dir, 'extraction');
  fs.mkdirSync(extractionDir, { recursive: true });

  const { engine, resolveConflicts } = activity.analyzeConfig!;
  const records: PackagedContentRecord[] = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));
  const targets = selectChapters(records, activity.analyzeConfig!.chapters, extractionDir);
  logger.info(`Analyzing ${targets.length} chapter(s) for workflow ${workflow.id} with ${engine}`);

  const progress = createAnalyzeProgress(workflow.id, activity.id);
  const usage = createUsageAccumulator();

  await runExtractStep(progress, engine, dir, extractionDir, targets, usage.add);

  const chapters = loadChapters(extractionDir);
  if (chapters.length === 0) {
    return;
  }

  const merged = await runMergeStep(progress, engine, chapters, usage.add);

  let world = merged;
  let resolutions: ConflictResolution[] = [];
  if (resolveConflicts) {
    const resolved = await runResolveStep(progress, engine, merged, usage.add);
    world = resolved.world;
    resolutions = resolved.resolutions;
  } else {
    progress.start('resolve');
    progress.done('resolve', 'skipped');
  }

  runRenderStep(progress, extractionDir, world, resolutions, chapters.length);

  logger.info(`Workflow ${workflow.id} analyze finished — ${chapters.length} chapter(s), ${resolutions.length} conflict(s) resolved`);
  logger.info(`Workflow ${workflow.id} analyze token usage — input: ${usage.total.inputTokens} (${usage.total.cachedInputTokens} cached), output: ${usage.total.outputTokens} (${usage.total.reasoningOutputTokens} reasoning)`);
}
