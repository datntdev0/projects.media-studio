import fs from 'node:fs';
import path from 'node:path';
import { chapterId } from '../workflow-pipeline';
import type { ChapterExtraction } from './types';

/** Where one chapter's extraction lives under a workflow's `extraction/` directory — shared by the analyze pipeline (writes it) and its readers (Output tab, Translate's glossary step). */
export function chapterFile(extractionDir: string, idx: number): string {
  return path.join(extractionDir, `${chapterId(idx)}.json`);
}

/** Reads one chapter's extraction, or `null` if that chapter hasn't been analyzed yet. */
export function loadChapter(extractionDir: string, idx: number): ChapterExtraction | null {
  const file = chapterFile(extractionDir, idx);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as ChapterExtraction) : null;
}

/** Every chapter extracted so far, in chapter order. */
export function loadChapters(extractionDir: string): ChapterExtraction[] {
  if (!fs.existsSync(extractionDir)) {
    return [];
  }
  return fs
    .readdirSync(extractionDir)
    .filter((file) => /^chapter-\d{4}\.json$/.test(file))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(extractionDir, file), 'utf8')) as ChapterExtraction);
}
