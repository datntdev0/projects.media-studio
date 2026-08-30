import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { getAppWorkflowExportDir } from '../paths';
import { createUsageAccumulator, runLlmPrint, type LlmUsage } from '../llm-cli';
import { chapterId, errorMessage, loadPackagedContents, runPool, selectChapters, type PackagedContentRecord } from '../workflow-pipeline';
import { chapterFile } from './extraction';
import { createAnalyzeProgress, type AnalyzeProgressTracker } from './progress';
import { CHAPTER_SCHEMA, CHAPTER_TEMPLATE } from './schemas';
import type { AppWorkflow } from '../../../shared/app-workflow';
import type { AnalyzeEngine, AppWorkflowActivity } from '../../../shared/app-workflow-activity';
export { readAnalyzeOutput, readAnalyzeCharacters, readAnalyzeGlossary, readAnalyzeTimeline } from './output';

const logger = createLogger('workflow-analyze');
const EXTRACT_WORKERS = 1;
const EXTRACT_TIMEOUT_MS = 300_000;

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
- glossary: every proper noun introduced or explained in this chapter (place, item, technique, faction, rank, title) with term/category/definition.
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

  const text = fs.readFileSync(path.join(dir, record.file!), 'utf8');
  const prompt = buildExtractPrompt(chapterId(record.idx), record.title, record.language, text);
  const data = await runLlmPrint(engine, prompt, { schema: CHAPTER_SCHEMA, timeoutMs: EXTRACT_TIMEOUT_MS, onUsage });
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf8');
}

async function runExtractStep(progress: AnalyzeProgressTracker, engine: AnalyzeEngine, dir: string, extractionDir: string, targets: PackagedContentRecord[], onUsage: (usage: LlmUsage) => void): Promise<void> {
  let counter = 1;
  progress.start('extract', `0/${targets.length} chapters`);
  try {
    await runPool(targets, EXTRACT_WORKERS, async (record) => {
      progress.update('extract', `${counter++}/${targets.length} chapters`);
      await extractChapter(engine, dir, extractionDir, record, onUsage);
    });
    progress.done('extract', `${targets.length} chapter(s)`);
  } catch (error) {
    progress.fail('extract', errorMessage(error));
    throw error;
  }
}

/**
 * Extracts each targeted chapter's glossary/characters/timeline into `extraction/chapter-NNNN.json`,
 * driven directly by the workflow orchestrator against the activity's exported working directory
 * (`data/workflows/<id>/`). Idempotent per chapter — an existing extraction file is left alone — so a
 * re-run only fills in gaps. The Output tab and the Contextual Translation activity both merge these
 * per-chapter files into a world bible on demand rather than reading a persisted combined file.
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

  const { engine } = activity.analyzeConfig!;
  const records = loadPackagedContents(dir);
  const targets = selectChapters(records, activity.analyzeConfig!.chapters, (record) => !fs.existsSync(chapterFile(extractionDir, record.idx)));
  logger.info(`Analyzing ${targets.length} chapter(s) for workflow ${workflow.id} with ${engine}`);

  const progress = createAnalyzeProgress(workflow.id, activity.id);
  const usage = createUsageAccumulator();

  await runExtractStep(progress, engine, dir, extractionDir, targets, usage.add);

  logger.info(`Workflow ${workflow.id} analyze finished — ${targets.length} chapter(s) extracted`);
  logger.info(`Workflow ${workflow.id} analyze token usage — input: ${usage.total.inputTokens} (${usage.total.cachedInputTokens} cached), output: ${usage.total.outputTokens} (${usage.total.reasoningOutputTokens} reasoning)`);
}
