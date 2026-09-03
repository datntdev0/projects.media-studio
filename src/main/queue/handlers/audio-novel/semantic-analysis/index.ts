import { logger } from '@/main/helpers/logger';
import { runLlmJson } from '@/main/helpers/llm-cli';
import { readWorkspaceChapter } from '@/main/helpers/paths';
import type { ChapterExtraction, WorldBible } from '@/shared/app-workspace-extraction';
import type { LlmSettings } from '@/shared/llm';
import { mergeWorldBible } from './merge';
import { buildChapterExtractionPrompt, CHAPTER_EXTRACTION_SCHEMA } from './prompt';
import { chapterIdxOf, readChapterExtractions, timelineIdxOf, writeChapterExtraction, writeWorldBible } from './store';

export { chapterFileStem, chapterIdxOf, hasChapterExtraction, listExtractedChapterNos, readChapterExtraction, readChapterExtractions, readWorldBible, worldBibleWrittenAt, writeWorldBible } from './store';
export { timelineIdxFor, worldTimelineIdx } from './merge';

/**
 * The ids the extraction is filed under are the app's to decide, not the model's:
 * whatever it echoed back is replaced by the chapter's real number, and its
 * timelines are renumbered in the order it listed them, so the merge can key
 * everything off them.
 */
function withKnownIds(extraction: ChapterExtraction, chapterNo: number, title: string): ChapterExtraction {
  return {
    ...extraction,
    chapterIdx: chapterIdxOf(chapterNo),
    chapterTitle: title,
    timelines: extraction.timelines.map((timeline, position) => ({ ...timeline, idx: timelineIdxOf(position + 1) })),
  };
}

/**
 * Extracts one chapter of a workspace's working copy into
 * `extractions/chapter-XXXX.json`, overwriting whatever was there. Callers are
 * expected to have decided the chapter needs extracting — see
 * `hasChapterExtraction`.
 */
export async function extractChapter(workspaceName: string, chapterNo: number, llm: LlmSettings): Promise<void> {
  const chapter = readWorkspaceChapter(workspaceName, chapterNo);
  if (!chapter) {
    throw new Error(`Chapter ${chapterNo} has no text in this workspace's working copy.`);
  }

  const prompt = buildChapterExtractionPrompt(chapterIdxOf(chapterNo), chapter.entry.title, chapter.entry.language, chapter.body);
  const extracted = (await runLlmJson(prompt, CHAPTER_EXTRACTION_SCHEMA, llm)) as ChapterExtraction;

  writeChapterExtraction(workspaceName, chapterNo, withKnownIds(extracted, chapterNo, chapter.entry.title));
}

/** Re-merges every chapter extracted so far into `extractions/world.json`. */
export function rebuildWorldBible(workspaceName: string): WorldBible {
  const chapters = readChapterExtractions(workspaceName);
  const world = mergeWorldBible(chapters);
  writeWorldBible(workspaceName, world);

  logger.info(`[extraction] world bible merged from ${chapters.length} chapter(s) — ${world.characters.length} character(s), ${world.timelines.length} timeline(s), ${world.glossary.length} term(s)`);
  return world;
}
