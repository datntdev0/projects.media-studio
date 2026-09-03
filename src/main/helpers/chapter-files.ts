import fs from 'node:fs';
import path from 'node:path';
import { fileWrittenAt } from './json-file';

/** Zero-padded chapter and timeline ids, e.g. `chapter0001-timeline0002`. */
export const IDX_WIDTH = 4;

/** The stem every per-chapter file shares — `chapter-0001`. */
export function chapterFileStem(chapterNo: number): string {
  return `chapter-${String(chapterNo).padStart(IDX_WIDTH, '0')}`;
}

/** The per-chapter files in `dir` with the given extension, in chapter order. */
export function listChapterFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.startsWith('chapter-') && name.endsWith(ext)).sort().map((name) => path.join(dir, name));
}

/** The chapter numbers of per-chapter files, read from their names alone. */
export function chapterNosOf(files: string[]): number[] {
  return files.map((file) => Number(/\d+/.exec(path.basename(file))![0]));
}

/** When the newest of the files was written, or undefined when there are none. */
export function latestWrittenAt(files: string[]): number | undefined {
  const stamps = files.map((file) => fileWrittenAt(file) ?? 0);
  return stamps.length === 0 ? undefined : Math.max(...stamps);
}
