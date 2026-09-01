import fs from 'node:fs';
import path from 'node:path';
import { getAppDataDir } from './paths';
import type { AppLibraryType } from '../../shared/app-library';
import { AppLibraryContentType, type ContentLanguage } from '../../shared/app-library-content';

// A chapter's text lives in a file rather than a database column, so the database stays small
// and a body is editable/diffable on disk:
//
//   <appData>/libraries/novel.<libraryId>/chapter-0001.txt        an original
//   <appData>/libraries/novel.<libraryId>/chapter-0001.vi.txt     its Vietnamese translation
//
// Paths are stored relative to the app data directory, so moving the data folder does not
// invalidate every row.

const LIBRARIES_DIR = 'libraries';

/** Zero-padded to sort correctly in a file listing, and to match the export package's own naming. */
const IDX_WIDTH = 4;

/** The folder holding one library item's content files, relative to the app data directory. */
export function libraryContentDir(libraryType: AppLibraryType, libraryId: string): string {
  return `${LIBRARIES_DIR}/${libraryType}.${libraryId}`;
}

/**
 * Where one content row's text belongs, relative to the app data directory. A translation is
 * suffixed with its language so it sits beside the original it shares an `idx` with instead of
 * overwriting it.
 */
export function contentFilePath(libraryType: AppLibraryType, libraryId: string, type: AppLibraryContentType, idx: number, language: ContentLanguage): string {
  const suffix = type === AppLibraryContentType.Translation ? `.${language}` : '';
  return `${libraryContentDir(libraryType, libraryId)}/chapter-${String(idx).padStart(IDX_WIDTH, '0')}${suffix}.txt`;
}

function absolute(relativePath: string): string {
  return path.join(getAppDataDir(), relativePath);
}

/** The stored text, or '' when the file is missing — a row can outlive its file, and a missing body is not worth failing a read over. */
export function readContentFile(relativePath: string | null): string {
  if (!relativePath) {
    return '';
  }

  try {
    return fs.readFileSync(absolute(relativePath), 'utf8');
  } catch {
    return '';
  }
}

export function writeContentFile(relativePath: string, body: string): void {
  const target = absolute(relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, 'utf8');
}

export function deleteContentFile(relativePath: string | null): void {
  if (relativePath) {
    fs.rmSync(absolute(relativePath), { force: true });
  }
}

/** Removes a library item's whole content folder — for when the item itself is deleted. */
export function deleteLibraryContentDir(libraryType: AppLibraryType, libraryId: string): void {
  fs.rmSync(absolute(libraryContentDir(libraryType, libraryId)), { recursive: true, force: true });
}
