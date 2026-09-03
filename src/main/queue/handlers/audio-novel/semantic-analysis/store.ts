import fs from 'node:fs';
import path from 'node:path';
import { fileWrittenAt, readJsonFile, writeJsonFile } from '@/main/helpers/json-file';
import { IDX_WIDTH, chapterFileStem, chapterNosOf, listChapterFiles } from '@/main/helpers/chapter-files';
import { getAppWorkspaceExtractionDir } from '@/main/helpers/paths';
import type { ChapterExtraction, WorldBible } from '@/shared/app-workspace-extraction';

export { chapterFileStem };

const WORLD_FILE = 'world.json';

/** A chapter's id inside an extraction — `chapter0001`. */
export function chapterIdxOf(chapterNo: number): string {
  return `chapter${String(chapterNo).padStart(IDX_WIDTH, '0')}`;
}

/** A timeline's id within its chapter — `timeline0001`. */
export function timelineIdxOf(position: number): string {
  return `timeline${String(position).padStart(IDX_WIDTH, '0')}`;
}

/** One chapter's extraction file, e.g. `chapter-0001.json`. */
function chapterFile(dir: string, chapterNo: number): string {
  return path.join(dir, `${chapterFileStem(chapterNo)}.json`);
}

/** The extraction files a workspace has, in chapter order. */
function extractionFiles(workspaceName: string): string[] {
  return listChapterFiles(getAppWorkspaceExtractionDir(workspaceName), '.json');
}

/** Whether the chapter already has an extraction on disk — checked without reading it. */
export function hasChapterExtraction(workspaceName: string, chapterNo: number): boolean {
  return fs.existsSync(chapterFile(getAppWorkspaceExtractionDir(workspaceName), chapterNo));
}

export function readChapterExtraction(workspaceName: string, chapterNo: number): ChapterExtraction | undefined {
  return readJsonFile<ChapterExtraction>(chapterFile(getAppWorkspaceExtractionDir(workspaceName), chapterNo));
}

export function writeChapterExtraction(workspaceName: string, chapterNo: number, extraction: ChapterExtraction): void {
  writeJsonFile(chapterFile(getAppWorkspaceExtractionDir(workspaceName), chapterNo), extraction);
}

/** The chapter numbers that have an extraction file, read from the file names alone. */
export function listExtractedChapterNos(workspaceName: string): number[] {
  return chapterNosOf(extractionFiles(workspaceName));
}

/**
 * Every chapter extracted so far, in chapter order. A file that is missing or no
 * longer readable JSON is skipped rather than failing the merge — the chapters
 * that are readable still make a usable world bible.
 */
export function readChapterExtractions(workspaceName: string): ChapterExtraction[] {
  return extractionFiles(workspaceName).flatMap((file) => {
    const extraction = readJsonFile<ChapterExtraction>(file);
    return extraction ? [extraction] : [];
  });
}

export function readWorldBible(workspaceName: string): WorldBible | undefined {
  return readJsonFile<WorldBible>(path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE));
}

export function writeWorldBible(workspaceName: string, world: WorldBible): void {
  writeJsonFile(path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE), world);
}

/** When `world.json` was last written, or undefined when the workspace has none. */
export function worldBibleWrittenAt(workspaceName: string): number | undefined {
  return fileWrittenAt(path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE));
}
