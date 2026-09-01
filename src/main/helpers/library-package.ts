import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Db } from '@/main/database/client';
import { COVER_PROTOCOL, getAppCoverDir } from './paths';
import { imageMediaType, writeCoverFile } from './cover-storage';
import { createAppLibrary, getAppLibrary } from '@/main/database/repositories/app-library.repo';
import { createAppLibraryContent, listAppLibraryContents } from '@/main/database/repositories/app-library-content.repo';
import { recount } from '@/main/managers/app-library-content.manager';
import { initialMetadata } from '@/main/managers/app-library.manager';
import { AppLibraryType } from '@/shared/app-library';
import { AppLibraryContentType } from '@/shared/app-library-content';
import {
  LIBRARY_PACKAGE_CHAPTERS_DIR,
  LIBRARY_PACKAGE_MANIFEST,
  LIBRARY_PACKAGE_SCHEMA,
  type LibraryPackageChapter,
  type LibraryPackageManifest,
  type LibraryPackagePreview,
} from '@/shared/app-library-package';

/** Zero-padded chapter file names, e.g. chapters/chapter-0001.txt. */
const IDX_WIDTH = 4;

/** The path characters Windows reserves — none of them may reach a file name. */
const RESERVED_FILENAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/** Everything below this code point is a C0 control character, which is no more welcome in a file name. */
const LAST_CONTROL_CODE_POINT = 0x1f;

/** Long titles exist; file systems still cap a name. Leaves room for the `library.` prefix and the `.zip` suffix. */
const MAX_SLUG_LENGTH = 80;

function isNameSafe(char: string): boolean {
  return !RESERVED_FILENAME_CHARS.has(char) && (char.codePointAt(0) ?? 0) > LAST_CONTROL_CODE_POINT;
}

/**
 * A title reduced to something a file system will accept, keeping the characters it can —
 * a Chinese or Vietnamese title stays readable rather than being stripped to nothing by an
 * ASCII-only slug. Reserved and control characters are dropped outright, then what whitespace
 * is left folds into dashes. Falls back to `library` when a title contributes no usable character.
 */
export function packageSlug(title: string): string {
  const cleaned = [...title]
    .filter(isNameSafe)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

  return cleaned || 'library';
}

function chapterFileName(idx: number): string {
  return `${LIBRARY_PACKAGE_CHAPTERS_DIR}/chapter-${String(idx).padStart(IDX_WIDTH, '0')}.txt`;
}

/** Resolves an `app-cover://` URL to the file on disk it names, or null for anything else (e.g. a remote URL) or a file that is gone. */
function coverFilePath(coverUrl: string | null): string | null {
  if (!coverUrl || !coverUrl.startsWith(`${COVER_PROTOCOL}://`)) {
    return null;
  }

  const fileName = path.basename(decodeURIComponent(new URL(coverUrl).pathname));
  const source = path.join(getAppCoverDir(), fileName);
  return fs.existsSync(source) ? source : null;
}

/**
 * Packages one library item as a `.zip`: its manifest, its cover, and one `.txt` per original
 * chapter that has a body. Translations are left out — the archive carries a novel as it was
 * sourced, not what a workspace later derived from it.
 */
export function buildLibraryPackage(db: Db, libraryId: string): { fileName: string; data: Buffer } {
  const library = getAppLibrary(db, libraryId);
  if (!library) {
    throw new Error(`Library item ${libraryId} not found`);
  }

  const zip = new AdmZip();
  const contents = listAppLibraryContents(db, libraryId, { type: AppLibraryContentType.Original });

  const chapters: LibraryPackageChapter[] = contents.flatMap((content) => {
    const text = content.textContent;
    if (!text) return [];

    const file = text.body ? chapterFileName(content.idx) : null;
    if (file) {
      zip.addFile(file, Buffer.from(text.body, 'utf8'));
    }

    return [{ idx: content.idx, title: text.title, language: text.language, status: content.status, file }];
  });

  const coverPath = coverFilePath(library.coverUrl);
  const cover = coverPath ? `cover${path.extname(coverPath)}` : null;
  if (coverPath && cover) {
    zip.addFile(cover, fs.readFileSync(coverPath));
  }

  const manifest: LibraryPackageManifest = {
    schema: LIBRARY_PACKAGE_SCHEMA,
    exportedAt: new Date().toISOString(),
    library: {
      title: library.title,
      type: library.type,
      cover,
      novel: library.novelMetadata && {
        status: library.novelMetadata.status,
        author: library.novelMetadata.author,
        language: library.novelMetadata.language,
        genres: library.novelMetadata.genres,
        description: library.novelMetadata.description,
      },
    },
    chapters,
  };

  zip.addFile(LIBRARY_PACKAGE_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

  return { fileName: `library.${packageSlug(library.title)}.zip`, data: zip.toBuffer() };
}

/** Opens the archive, reporting the "this isn't a zip at all" case in the caller's own words rather than the zip reader's. */
function openPackage(data: Buffer): AdmZip {
  try {
    return new AdmZip(data);
  } catch {
    throw new Error('That file is not a readable .zip archive.');
  }
}

/** Reads and checks `library.json`, so an unusable archive is rejected before any of it is written. */
function readManifest(zip: AdmZip): LibraryPackageManifest {
  const entry = zip.getEntry(LIBRARY_PACKAGE_MANIFEST);
  if (!entry) {
    throw new Error(`This is not a library package — it holds no ${LIBRARY_PACKAGE_MANIFEST}.`);
  }

  let manifest: LibraryPackageManifest;
  try {
    manifest = JSON.parse(entry.getData().toString('utf8')) as LibraryPackageManifest;
  } catch {
    throw new Error(`This package's ${LIBRARY_PACKAGE_MANIFEST} is not readable JSON.`);
  }

  if (manifest.schema > LIBRARY_PACKAGE_SCHEMA) {
    throw new Error(`This package was written by a newer version of the app (schema ${manifest.schema}; this one reads up to ${LIBRARY_PACKAGE_SCHEMA}).`);
  }
  if (!manifest.library?.title?.trim()) {
    throw new Error('This package names no library item.');
  }
  if (!Object.values(AppLibraryType).includes(manifest.library.type)) {
    throw new Error(`This package holds an unknown library type '${manifest.library.type}'.`);
  }
  if (!Array.isArray(manifest.chapters)) {
    throw new Error('This package holds no chapter list.');
  }

  return manifest;
}

/**
 * The archive's cover as a `data:` URL an `<img>` can render, or null when there is no cover
 * entry or its bytes are not an image. Inline rather than on disk: nothing is imported yet, so
 * a preview must leave nothing behind if the user backs out.
 */
function coverDataUrl(zip: AdmZip, entryName: string | null): string | null {
  const entry = entryName ? zip.getEntry(entryName) : null;
  if (!entry) {
    return null;
  }

  const bytes = entry.getData();
  const mediaType = imageMediaType(bytes);
  return mediaType ? `data:${mediaType};base64,${bytes.toString('base64')}` : null;
}

/** What importing an archive would create, read without writing anything. */
export function previewLibraryPackage(data: Buffer): LibraryPackagePreview {
  const zip = openPackage(data);
  const { library: item, chapters } = readManifest(zip);

  return {
    title: item.title,
    type: item.type,
    author: item.novel?.author ?? null,
    language: item.novel?.language ?? null,
    // Empty folds to null: a package whose source had no synopsis stores '', and the dialog
    // should treat that the same as absent rather than render a blank block.
    description: item.novel?.description?.trim() || null,
    cover: coverDataUrl(zip, item.cover),
    chapterCount: chapters.length,
    bodyCount: chapters.filter((chapter) => chapter.file).length,
  };
}

/** Saves the archive's cover into the app's own cover store, returning the URL to point the new item at. */
function importCover(zip: AdmZip, entryName: string): string | null {
  const entry = zip.getEntry(entryName);
  if (!entry) {
    return null;
  }

  return writeCoverFile(`${randomUUID()}${path.extname(entryName) || '.jpg'}`, entry.getData());
}

/**
 * Creates a new library item from an archive — its metadata, its cover, and one chapter row per
 * manifest entry, carrying the body when the archive holds one. The item is always new: importing
 * the same package twice yields two items rather than merging into the first.
 */
export function importLibraryPackage(db: Db, data: Buffer): string {
  const zip = openPackage(data);
  const manifest = readManifest(zip);
  const item = manifest.library;

  const created = createAppLibrary(db, {
    title: item.title,
    type: item.type,
    coverUrl: item.cover ? importCover(zip, item.cover) : null,
    ...initialMetadata({ title: item.title, type: item.type, novel: item.novel ?? undefined }),
  });

  for (const chapter of manifest.chapters) {
    createAppLibraryContent(db, created.id, {
      idx: chapter.idx,
      type: AppLibraryContentType.Original,
      status: chapter.status,
      textContent: { body: chapter.file ? (zip.readAsText(chapter.file) ?? '') : '', language: chapter.language, title: chapter.title },
      imageContent: null,
      videoContent: null,
    });
  }

  recount(db, created.id);

  return created.id;
}
