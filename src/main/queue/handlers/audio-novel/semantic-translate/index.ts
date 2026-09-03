import { logger } from '@/main/helpers/logger';
import { readWorkspaceManifest } from '@/main/helpers/paths';
import { listExtractedChapterNos, readChapterExtraction, readWorldBible } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { LANGUAGE_NAME, TRANSLATION_LANGUAGE, type ChapterTranslation, type WorldTranslation } from '@/shared/app-workspace-translation';
import type { LlmSettings } from '@/shared/llm';
import { chapterTranslationOf } from './distribute';
import { emptyWorldTranslation, translateMissingMetadata, type MetadataTranslationContext } from './metadata';
import { readChapterTranslation, readWorldTranslation, writeChapterTranslation, writeWorldTranslation } from './store';

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
 * Brings `world.vi.json` up to date with `world.json`, translating only what it
 * does not cover yet and keeping every edit made to it. Each section is written
 * as it lands, so a call that fails part-way leaves what it got through.
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
