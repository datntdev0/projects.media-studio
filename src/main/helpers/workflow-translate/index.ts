import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { getAppWorkflowExportDir } from '../paths';
import { createUsageAccumulator, runLlmPrint, type LlmUsage } from '../llm-cli';
import { chapterId, errorMessage, loadPackagedContents, runPool, selectChapters, type PackagedContentRecord } from '../workflow-pipeline';
import type { WorldBible } from '../workflow-analyze/types';
import { CHAPTER_TRANSLATION_SCHEMA, GLOSSARY_TRANSLATION_SCHEMA } from './schemas';
import { renderTranslatedGlossaryMarkdown } from './render';
import type { TranslatedGlossary } from './types';
import { createTranslateProgress, type TranslateProgressTracker } from './progress';
import { ContentLanguage } from '../../../shared/app-library-content';
import type { AppWorkflow } from '../../../shared/app-workflow';
import type { AnalyzeEngine, AppWorkflowActivity } from '../../../shared/app-workflow-activity';
export { readTranslateOutput, readTranslateChapters, readTranslateChapterText } from './output';

const logger = createLogger('workflow-translate');
const TRANSLATE_WORKERS = 1;
const GLOSSARY_TIMEOUT_MS = 300_000;
const CHAPTER_TIMEOUT_MS = 300_000;

const LANGUAGE_NAME: Record<ContentLanguage, string> = {
  [ContentLanguage.Vietnamese]: 'Vietnamese',
  [ContentLanguage.English]: 'English',
  [ContentLanguage.Chinese]: 'Chinese',
};

const RULES_TEXT = `Translation rules:
- Translate meaning and tone, not word-for-word; keep the register of a web/light novel (colloquial, punchy, fast to read).
- Keep character names, place names, titles, and setting-specific terms consistent with how they were translated elsewhere in the book. When a glossary is given, treat it as the authority for that.
- Keep every line of dialogue, narration, and interjection — do not summarize, merge, or drop lines.
- Do not add anything that is not in the source: no translator's notes, no explanations, no content warnings, no extra punctuation or emphasis.
- Do not censor or soften content that is present in the source.
- Preserve the source's paragraph and line structure exactly; do not reflow line breaks.
- Output only the translated content itself, with no preamble like "Here is the translation" and no surrounding quotes or code fences.`;

function glossaryJsonFile(langDir: string): string {
  return path.join(langDir, 'glossary.json');
}

function glossaryFile(langDir: string): string {
  return path.join(langDir, 'glossary.md');
}

function chapterTextFile(langDir: string, idx: number): string {
  return path.join(langDir, 'chapters', `${chapterId(idx)}.txt`);
}

function chapterTitleFile(langDir: string, idx: number): string {
  return path.join(langDir, 'chapters', `${chapterId(idx)}.title.txt`);
}

function buildGlossaryPrompt(language: string, world: WorldBible): string {
  const glossary = world.overview.glossary.map(({ term, category, definition }) => ({ term, category, definition }));
  const characters = world.characters.map(({ name, aliases }) => ({ name, aliases }));

  return `${RULES_TEXT}

Translate this novel's glossary of terms and its character roster into ${language}. This becomes the one bilingual reference every chapter's translation looks up original terms and names against, so it must stay internally consistent.

Glossary terms (original language):
${JSON.stringify(glossary, null, 2)}

Characters (original language):
${JSON.stringify(characters, null, 2)}

For each glossary term, return the same "term" unchanged, plus "translatedTerm" (that term translated/transliterated into ${language}), and "category"/"definition" translated into ${language}.

For each character, return the same "name" and "aliases" unchanged, plus "translatedName" and "translatedAliases" — the name and each alias translated/transliterated into ${language}, same order, same count as "aliases".

Return only the JSON object.`;
}

function buildChapterPrompt(id: string, title: string, language: string, glossary: string, text: string): string {
  return `${RULES_TEXT}

Translate chapter ${id} of a novel into ${language}.

Bilingual reference glossary and character roster for this book — each row pairs an original term or character name with its already-decided ${language} translation. Whenever an original term or name from this list appears in the chapter, render it as the given ${language} translation exactly, for consistency with the rest of the book. Do not leave any name or term in its original language anywhere in your translation:
---
${glossary}
---

Chapter title (original language): ${title}

Original chapter text, one sentence per line:
---
${text}
---

Return a JSON object with:
- "title": the chapter title above, translated into ${language}
- "body": the chapter text translated into ${language}, with the same number of lines, in the same order, one translated line per source line

Return only the JSON object.`;
}

/** Translates the book's whole-book world bible (`extraction/world.json`, from the Semantic Analyze activity) into a bilingual glossary, once — the fixed original/translated term and name pairing every chapter's translation reuses so nothing drifts chapter to chapter, and no original-language name survives into the translated text. */
async function translateGlossary(engine: AnalyzeEngine, extractionDir: string, langDir: string, language: string, onUsage: (usage: LlmUsage) => void): Promise<void> {
  if (fs.existsSync(glossaryFile(langDir))) {
    return;
  }

  const sourceFile = path.join(extractionDir, 'world.json');
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`${sourceFile} not found — run the Semantic Analyze activity first`);
  }

  const world = JSON.parse(fs.readFileSync(sourceFile, 'utf8')) as WorldBible;
  const prompt = buildGlossaryPrompt(language, world);
  const translated = (await runLlmPrint(engine, prompt, { schema: GLOSSARY_TRANSLATION_SCHEMA, timeoutMs: GLOSSARY_TIMEOUT_MS, onUsage })) as TranslatedGlossary;
  fs.writeFileSync(glossaryJsonFile(langDir), JSON.stringify(translated, null, 2), 'utf8');
  fs.writeFileSync(glossaryFile(langDir), renderTranslatedGlossaryMarkdown(translated), 'utf8');
}

async function runGlossaryStep(progress: TranslateProgressTracker, engine: AnalyzeEngine, extractionDir: string, langDir: string, language: string, onUsage: (usage: LlmUsage) => void): Promise<void> {
  progress.start('glossary');
  try {
    await translateGlossary(engine, extractionDir, langDir, language, onUsage);
    progress.done('glossary');
  } catch (error) {
    progress.fail('glossary', errorMessage(error));
    throw error;
  }
}

/** Translates one chapter's title and original text in a single call, reusing the whole-book translated glossary (from `runGlossaryStep`) for consistent names and terms. */
async function translateChapter(engine: AnalyzeEngine, dir: string, langDir: string, language: string, glossary: string, record: PackagedContentRecord, onUsage: (usage: LlmUsage) => void): Promise<void> {
  const outFile = chapterTextFile(langDir, record.idx);
  if (fs.existsSync(outFile)) {
    return;
  }

  const id = chapterId(record.idx);
  const text = fs.readFileSync(path.join(dir, record.file!), 'utf8');
  const prompt = buildChapterPrompt(id, record.title, language, glossary, text);
  const result = (await runLlmPrint(engine, prompt, { schema: CHAPTER_TRANSLATION_SCHEMA, timeoutMs: CHAPTER_TIMEOUT_MS, onUsage })) as { title: string; body: string };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, result.body.trim(), 'utf8');
  fs.writeFileSync(chapterTitleFile(langDir, record.idx), result.title.trim(), 'utf8');
}

async function runChaptersStep(progress: TranslateProgressTracker, engine: AnalyzeEngine, dir: string, langDir: string, language: string, glossary: string, targets: PackagedContentRecord[], onUsage: (usage: LlmUsage) => void): Promise<void> {
  progress.start('chapters', `0/${targets.length} chapters`);
  let counter = 1;
  try {
    await runPool(targets, TRANSLATE_WORKERS, async (record) => {
      progress.update('chapters', `${counter++}/${targets.length} chapters`);
      await translateChapter(engine, dir, langDir, language, glossary, record, onUsage);
    });
    progress.done('chapters', `${targets.length} chapter(s)`);
  } catch (error) {
    progress.fail('chapters', errorMessage(error));
    throw error;
  }
}

/**
 * Translates the whole-book glossary into a bilingual reference once, then each targeted chapter's
 * title and text reusing it, driven directly by the workflow orchestrator against the activity's
 * exported working directory (`data/workflows/<id>/`). Builds on top of an existing Semantic Analyze
 * run — `extraction/world.json` must already exist. Writes `translation/<language>/glossary.json`
 * and `glossary.md` (original terms/names paired with their translation) and, per chapter,
 * `translation/<language>/chapters/chapter-NNNN.txt` (translated body, with every original-language
 * name or term rendered in its translated form) and `chapter-NNNN.title.txt` (translated title). Both
 * steps are idempotent — an existing output file is left alone — so a re-run only fills in gaps: for
 * N chapters still needing translation, this makes N + 1 model calls total (one glossary call, one
 * call per chapter). Each step's progress is persisted (for the Output tab to poll) and logged as it
 * advances.
 */
export async function runWorkflowTranslate(workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  const dir = getAppWorkflowExportDir(workflow.id);
  const contentsPath = path.join(dir, 'contents.json');
  if (!fs.existsSync(contentsPath)) {
    logger.warn(`Workflow ${workflow.id} has no exported contents — skipping translate`);
    return;
  }

  const extractionDir = path.join(dir, 'extraction');
  const { engine, language, chapters } = activity.translateConfig!;
  const languageName = LANGUAGE_NAME[language];
  const langDir = path.join(dir, 'translation', language);
  fs.mkdirSync(path.join(langDir, 'chapters'), { recursive: true });

  const records = loadPackagedContents(dir);
  const targets = selectChapters(records, chapters, (record) => !fs.existsSync(chapterTextFile(langDir, record.idx)));
  if (targets.length === 0) {
    logger.info(`Workflow ${workflow.id} has no chapter left to translate into ${languageName}`);
    return;
  }
  logger.info(`Translating ${targets.length} chapter(s) for workflow ${workflow.id} into ${languageName} with ${engine}`);

  const progress = createTranslateProgress(workflow.id, activity.id);
  const usage = createUsageAccumulator();

  await runGlossaryStep(progress, engine, extractionDir, langDir, languageName, usage.add);
  const glossary = fs.readFileSync(glossaryFile(langDir), 'utf8');
  await runChaptersStep(progress, engine, dir, langDir, languageName, glossary, targets, usage.add);

  logger.info(`Workflow ${workflow.id} translate finished — ${targets.length} chapter(s) into ${languageName}`);
  logger.info(`Workflow ${workflow.id} translate token usage — input: ${usage.total.inputTokens} (${usage.total.cachedInputTokens} cached), output: ${usage.total.outputTokens} (${usage.total.reasoningOutputTokens} reasoning)`);
}
