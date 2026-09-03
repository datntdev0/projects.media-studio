import fs from 'node:fs';
import path from 'node:path';
import { fileWrittenAt, readJsonFile, writeJsonFile } from '@/main/helpers/json-file';
import { getAppWorkspaceTranslationDir } from '@/main/helpers/paths';
import { chapterFileStem, chapterNosOf, latestWrittenAt, listChapterFiles } from '@/main/helpers/chapter-files';
import { TRANSLATION_LANGUAGE, type ChapterTranslation, type WorldTranslation } from '@/shared/app-workspace-translation';

const WORLD_FILE = `world.${TRANSLATION_LANGUAGE}.json`;
const META_EXT = `.${TRANSLATION_LANGUAGE}.json`;
const TEXT_EXT = `.${TRANSLATION_LANGUAGE}.txt`;

function worldFile(workspaceName: string): string {
  return path.join(getAppWorkspaceTranslationDir(workspaceName), WORLD_FILE);
}

/** One chapter's distributed metadata, e.g. `chapter-0001.vi.json`. */
function chapterMetaFile(workspaceName: string, chapterNo: number): string {
  return path.join(getAppWorkspaceTranslationDir(workspaceName), `${chapterFileStem(chapterNo)}${META_EXT}`);
}

/** One chapter's translated text, e.g. `chapter-0001.vi.txt`. */
function chapterTextFile(workspaceName: string, chapterNo: number): string {
  return path.join(getAppWorkspaceTranslationDir(workspaceName), `${chapterFileStem(chapterNo)}${TEXT_EXT}`);
}

/** The per-chapter files with the given extension, in chapter order. */
function chapterFiles(workspaceName: string, ext: string): string[] {
  return listChapterFiles(getAppWorkspaceTranslationDir(workspaceName), ext);
}

export function readWorldTranslation(workspaceName: string): WorldTranslation | undefined {
  return readJsonFile<WorldTranslation>(worldFile(workspaceName));
}

export function writeWorldTranslation(workspaceName: string, world: WorldTranslation): void {
  writeJsonFile(worldFile(workspaceName), world);
}

export function worldTranslationWrittenAt(workspaceName: string): number | undefined {
  return fileWrittenAt(worldFile(workspaceName));
}

export function readChapterTranslation(workspaceName: string, chapterNo: number): ChapterTranslation | undefined {
  return readJsonFile<ChapterTranslation>(chapterMetaFile(workspaceName, chapterNo));
}

export function writeChapterTranslation(workspaceName: string, chapterNo: number, translation: ChapterTranslation): void {
  writeJsonFile(chapterMetaFile(workspaceName, chapterNo), translation);
}

/** The chapters whose metadata has been distributed, read from the file names alone. */
export function listDistributedChapterNos(workspaceName: string): number[] {
  return chapterNosOf(chapterFiles(workspaceName, META_EXT));
}

/** When the last chapter metadata was distributed, or undefined when none has been. */
export function chaptersDistributedAt(workspaceName: string): number | undefined {
  return latestWrittenAt(chapterFiles(workspaceName, META_EXT));
}

/** Whether the chapter's text is already translated — checked without reading it. */
export function hasChapterText(workspaceName: string, chapterNo: number): boolean {
  return fs.existsSync(chapterTextFile(workspaceName, chapterNo));
}

export function readChapterText(workspaceName: string, chapterNo: number): string | undefined {
  const file = chapterTextFile(workspaceName, chapterNo);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

export function writeChapterText(workspaceName: string, chapterNo: number, text: string): void {
  const file = chapterTextFile(workspaceName, chapterNo);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

/** The chapters whose text has been translated, read from the file names alone. */
export function listTranslatedChapterNos(workspaceName: string): number[] {
  return chapterNosOf(chapterFiles(workspaceName, TEXT_EXT));
}
