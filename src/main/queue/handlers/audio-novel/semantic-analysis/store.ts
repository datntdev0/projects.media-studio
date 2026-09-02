import fs from 'node:fs';
import path from 'node:path';
import { getAppWorkspaceExtractionDir } from '@/main/helpers/paths';
import type { ChapterExtraction, WorldBible } from '@/shared/app-workspace-extraction';

/** Zero-padded chapter and timeline ids, e.g. `chapter0001-timeline0002`. */
const IDX_WIDTH = 4;

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
  return path.join(dir, `chapter-${String(chapterNo).padStart(IDX_WIDTH, '0')}.json`);
}

/** The extraction files a workspace has, in chapter order. */
function extractionFileNames(workspaceName: string): string[] {
  const dir = getAppWorkspaceExtractionDir(workspaceName);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => /^chapter-\d+\.json$/.test(name)).sort();
}

function readJson<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

/** Whether the chapter already has an extraction on disk — checked without reading it. */
export function hasChapterExtraction(workspaceName: string, chapterNo: number): boolean {
  return fs.existsSync(chapterFile(getAppWorkspaceExtractionDir(workspaceName), chapterNo));
}

export function writeChapterExtraction(workspaceName: string, chapterNo: number, extraction: ChapterExtraction): void {
  writeJson(chapterFile(getAppWorkspaceExtractionDir(workspaceName), chapterNo), extraction);
}

/** The chapter numbers that have an extraction file, read from the file names alone. */
export function listExtractedChapterNos(workspaceName: string): number[] {
  return extractionFileNames(workspaceName).map((name) => Number(/\d+/.exec(name)![0]));
}

/**
 * Every chapter extracted so far, in chapter order. A file that is missing or no
 * longer readable JSON is skipped rather than failing the merge — the chapters
 * that are readable still make a usable world bible.
 */
export function readChapterExtractions(workspaceName: string): ChapterExtraction[] {
  const dir = getAppWorkspaceExtractionDir(workspaceName);
  return extractionFileNames(workspaceName).flatMap((name) => {
    const extraction = readJson<ChapterExtraction>(path.join(dir, name));
    return extraction ? [extraction] : [];
  });
}

export function readWorldBible(workspaceName: string): WorldBible | undefined {
  return readJson<WorldBible>(path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE));
}

export function writeWorldBible(workspaceName: string, world: WorldBible): void {
  writeJson(path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE), world);
}

/** When `world.json` was last written, or undefined when the workspace has none. */
export function worldBibleWrittenAt(workspaceName: string): number | undefined {
  const file = path.join(getAppWorkspaceExtractionDir(workspaceName), WORLD_FILE);
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : undefined;
}
