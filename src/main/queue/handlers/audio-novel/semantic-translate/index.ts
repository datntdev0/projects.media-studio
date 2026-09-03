import { logger } from '@/main/helpers/logger';
import { runLlmJson } from '@/main/helpers/llm-cli';
import { readWorkspaceChapter, readWorkspaceManifest } from '@/main/helpers/paths';
import { listExtractedChapterNos, readChapterExtraction, readWorldBible } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { LANGUAGE_NAME, TRANSLATION_LANGUAGE, type ChapterTranslation, type WorldTranslation } from '@/shared/app-workspace-translation';
import type { LlmSettings } from '@/shared/llm';
import { chapterTranslationOf } from './distribute';
import { emptyWorldTranslation, translateMissingMetadata, type MetadataTranslationContext } from './metadata';
import { buildChapterPrompt, CHAPTER_TEXT_TRANSLATION_SCHEMA, type ChapterTextTranslated } from './prompt';
import { readChapterTranslation, readWorldTranslation, writeChapterText, writeChapterTranslation, writeWorldTranslation } from './store';

export { chaptersDistributedAt, hasChapterText, listDistributedChapterNos, listTranslatedChapterNos, readChapterText, readChapterTranslation, readWorldTranslation, worldTranslationWrittenAt, writeChapterText, writeWorldTranslation } from './store';

/** Said by the screen's button and by the step, so both name the same fix. */
const NOTHING_EXTRACTED_MESSAGE = 'Semantic Analysis has not extracted any chapter yet — there is nothing to translate.';

/** The language the working copy's chapters are in, as the prompt names it. */
function sourceLanguageOf(workspaceName: string): string {
  const language = readWorkspaceManifest(workspaceName)?.chapters.find((chapter) => chapter.file)?.language;
  return language ? LANGUAGE_NAME[language] : 'the original language';
}

function contextOf(workspaceName: string, llm: LlmSettings): MetadataTranslationContext {
  return { llm, language: LANGUAGE_NAME[TRANSLATION_LANGUAGE], sourceLanguage: sourceLanguageOf(workspaceName) };
}

/**
 * Brings `world.vi.json` up to date with `world.json`: an entry it already has
 * is skipped, edits and all, and only the new ones are sent. Every batch is
 * written as it lands, so a call that fails part-way loses one batch at most.
 */
export async function translateWorldMetadata(workspaceName: string, llm: LlmSettings): Promise<WorldTranslation> {
  const source = readWorldBible(workspaceName);
  if (!source) throw new Error(NOTHING_EXTRACTED_MESSAGE);

  const world = readWorldTranslation(workspaceName) ?? emptyWorldTranslation();
  let written = JSON.stringify(world);
  await translateMissingMetadata(world, source, contextOf(workspaceName, llm), (current) => {
    const next = JSON.stringify(current);
    if (next === written) return;
    writeWorldTranslation(workspaceName, current);
    written = next;
  });
  return world;
}

/** Writes one chapter's `chapter-XXXX.vi.json` from its extraction and the world translation, keeping the title already translated for it. */
function distributeChapter(workspaceName: string, chapterNo: number, world: WorldTranslation): ChapterTranslation | undefined {
  const extraction = readChapterExtraction(workspaceName, chapterNo);
  if (!extraction) return undefined;

  const translation = chapterTranslationOf(extraction, world, readChapterTranslation(workspaceName, chapterNo)?.chapterTitle ?? '');
  writeChapterTranslation(workspaceName, chapterNo, translation);
  return translation;
}

/** Rewrites the metadata of every extracted chapter from `world.vi.json`. Returns how many chapters were written. */
export function distributeChapters(workspaceName: string): number {
  const world = readWorldTranslation(workspaceName);
  if (!world) throw new Error('Translate the metadata before distributing it to the chapters.');

  const chapterNos = listExtractedChapterNos(workspaceName);
  chapterNos.forEach((chapterNo) => distributeChapter(workspaceName, chapterNo, world));
  logger.info(`[translation] metadata distributed to ${chapterNos.length} chapter(s)`);
  return chapterNos.length;
}

/**
 * Translates one chapter's text into `chapter-XXXX.vi.txt`, and its title into
 * the chapter's metadata file. The metadata the prompt leans on is made current
 * first — the world translation is brought up to date with what analysis has
 * extracted, and the chapter's own metadata is distributed if the screen has not
 * done so — so a run straight after analysis needs no step in between. Callers
 * are expected to have decided the chapter needs translating — see `hasChapterText`.
 */
export async function translateChapter(workspaceName: string, chapterNo: number, llm: LlmSettings): Promise<void> {
  const chapter = readWorkspaceChapter(workspaceName, chapterNo);
  if (!chapter) throw new Error(`Chapter ${chapterNo} has no text in this workspace's working copy.`);
  if (!readChapterExtraction(workspaceName, chapterNo)) throw new Error(`Chapter ${chapterNo} has not been extracted — run Semantic Analysis over it first.`);

  const world = await translateWorldMetadata(workspaceName, llm);
  const metadata = readChapterTranslation(workspaceName, chapterNo) ?? distributeChapter(workspaceName, chapterNo, world)!;

  const context = contextOf(workspaceName, llm);
  const prompt = buildChapterPrompt(metadata, chapter.body, context.language, context.sourceLanguage);
  const translated = (await runLlmJson(prompt, CHAPTER_TEXT_TRANSLATION_SCHEMA, llm)) as ChapterTextTranslated;

  writeChapterText(workspaceName, chapterNo, translated.body.trim());
  writeChapterTranslation(workspaceName, chapterNo, { ...metadata, chapterTitle: translated.title.replaceAll(':', '').trim() });
  logger.info(`[translation] chapter ${chapterNo} translated — ${translated.body.length} character(s)`);
}
