// Shared plumbing for a workflow's script-driven pipeline activities (Analyze, Translate) — both
// walk the same exported `contents.json` manifest chapter by chapter, so the chapter-selection and
// concurrency logic lives here once rather than being copied into each pipeline.

import fs from 'node:fs';
import path from 'node:path';
import { ActivityChapterScope, type ChapterSelection } from '../../shared/app-workflow-activity';
import { AppLibraryContentType } from '../../shared/app-library-content';

export interface PackagedContentRecord {
  id: string;
  idx: number;
  type: string;
  language: string;
  title: string;
  file: string | null;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Zero-padded `chapter-NNNN` id a chapter's idx is addressed by across every pipeline's working-directory files. */
export function chapterId(idx: number): string {
  return `chapter-${String(idx).padStart(4, '0')}`;
}

export function loadPackagedContents(dir: string): PackagedContentRecord[] {
  return JSON.parse(fs.readFileSync(path.join(dir, 'contents.json'), 'utf8'));
}

/** Which exported original chapters an activity's `chapters` selection covers, resolved purely from the working directory's `contents.json` manifest. `isMissing` decides what "missing output" means for the calling pipeline (e.g. no extraction file yet, no translated chapter yet). */
export function selectChapters(records: PackagedContentRecord[], chapters: ChapterSelection, isMissing: (record: PackagedContentRecord) => boolean): PackagedContentRecord[] {
  const originals = records.filter((record) => record.type === AppLibraryContentType.Original && record.file);
  switch (chapters.scope) {
    case ActivityChapterScope.All:
      return originals;
    case ActivityChapterScope.Range:
      return originals.filter((record) => record.idx >= chapters.rangeFrom && record.idx <= chapters.rangeTo);
    case ActivityChapterScope.Picked:
      return originals.filter((record) => chapters.pickedContentIds.includes(record.id));
    case ActivityChapterScope.Missing:
      return originals.filter(isMissing);
  }
}

/** Runs `task` over `items` with up to `workers` running concurrently. */
export async function runPool<T>(items: T[], workers: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lane = async (): Promise<void> => {
    while (cursor < items.length) {
      await task(items[cursor++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, lane));
}
