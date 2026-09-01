import AdmZip from 'adm-zip';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildLibraryPackage, importLibraryPackage, packageSlug, previewLibraryPackage } from './library-package';
import { createTestDb } from '@/main/database/test-db';
import { seedLibrary } from '@/main/database/test-fixtures';
import { getAppLibrary } from '@/main/database/repositories/app-library.repo';
import { createAppLibraryContent, listAppLibraryContents } from '@/main/database/repositories/app-library-content.repo';
import type { Db } from '@/main/database/client';
import { AppLibraryType, NovelStatus } from '@/shared/app-library';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage } from '@/shared/app-library-content';
import { LIBRARY_PACKAGE_MANIFEST, LIBRARY_PACKAGE_SCHEMA, type LibraryPackageManifest } from '@/shared/app-library-package';

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

function seedChapter(libraryId: string, idx: number, title: string, body: string, type = AppLibraryContentType.Original) {
  return createAppLibraryContent(db, libraryId, {
    idx,
    type,
    status: body ? AppLibraryContentStatus.Completed : AppLibraryContentStatus.Discovered,
    textContent: { body, language: ContentLanguage.Chinese, title },
    imageContent: null,
    videoContent: null,
  });
}

function manifestOf(data: Buffer): LibraryPackageManifest {
  return JSON.parse(new AdmZip(data).readAsText(LIBRARY_PACKAGE_MANIFEST)) as LibraryPackageManifest;
}

describe('packageSlug', () => {
  it('keeps non-ASCII titles readable and swaps spaces for dashes', () => {
    expect(packageSlug('修真聊天群 Book One')).toBe('修真聊天群-Book-One');
  });

  it('drops the characters a file name cannot carry, and joins what is left on dashes', () => {
    expect(packageSlug('A/B: "C" <D>|E?')).toBe('AB-C-DE');
  });

  it('falls back to a usable name when a title contributes nothing', () => {
    expect(packageSlug('///')).toBe('library');
  });
});

describe('buildLibraryPackage', () => {
  it('names the archive after the item and writes one file per chapter with a body', () => {
    const library = seedLibrary(db, AppLibraryType.Novel, { title: 'My Novel' });
    seedChapter(library.id, 1, 'One', 'first body');
    seedChapter(library.id, 2, 'Two', 'second body');

    const { fileName, data } = buildLibraryPackage(db, library.id);
    const zip = new AdmZip(data);

    expect(fileName).toBe('library.My-Novel.zip');
    expect(zip.getEntries().map((entry) => entry.entryName).sort()).toEqual([
      'chapters/chapter-0001.txt',
      'chapters/chapter-0002.txt',
      LIBRARY_PACKAGE_MANIFEST,
    ]);
    expect(zip.readAsText('chapters/chapter-0001.txt')).toBe('first body');
  });

  it('records a chapter with no body in the manifest but writes no file for it', () => {
    const library = seedLibrary(db, AppLibraryType.Novel);
    seedChapter(library.id, 1, 'Not fetched yet', '');

    const { data } = buildLibraryPackage(db, library.id);
    const manifest = manifestOf(data);

    expect(manifest.schema).toBe(LIBRARY_PACKAGE_SCHEMA);
    expect(manifest.chapters).toEqual([
      { idx: 1, title: 'Not fetched yet', language: ContentLanguage.Chinese, status: AppLibraryContentStatus.Discovered, file: null },
    ]);
    expect(new AdmZip(data).getEntry('chapters/chapter-0001.txt')).toBeNull();
  });

  it('leaves translations out — only the original chapters travel', () => {
    const library = seedLibrary(db, AppLibraryType.Novel);
    seedChapter(library.id, 1, 'One', 'original body');
    seedChapter(library.id, 1, 'Một', 'translated body', AppLibraryContentType.Translation);

    const { data } = buildLibraryPackage(db, library.id);

    expect(manifestOf(data).chapters).toHaveLength(1);
    expect(new AdmZip(data).readAsText('chapters/chapter-0001.txt')).toBe('original body');
  });

  it('carries the item metadata an importing workspace needs', () => {
    const library = seedLibrary(db, AppLibraryType.Novel, { title: 'Sourced' });

    const manifest = manifestOf(buildLibraryPackage(db, library.id).data);

    expect(manifest.library).toMatchObject({ title: 'Sourced', type: AppLibraryType.Novel, cover: null });
    expect(manifest.library.novel).toMatchObject({ author: 'Author', language: 'en' });
  });

  it('refuses an item that is not there', () => {
    expect(() => buildLibraryPackage(db, 'nope')).toThrow(/not found/);
  });
});

/** Builds an archive holding just the given manifest — for the cases a real export can never produce. */
function zipWithManifest(manifest: unknown, entries: Record<string, Buffer> = {}): Buffer {
  const zip = new AdmZip();
  zip.addFile(LIBRARY_PACKAGE_MANIFEST, Buffer.from(JSON.stringify(manifest), 'utf8'));
  for (const [name, data] of Object.entries(entries)) {
    zip.addFile(name, data);
  }
  return zip.toBuffer();
}

/** A manifest naming `cover.jpg`, for the cover-preview cases. */
function coveredManifest() {
  return { schema: LIBRARY_PACKAGE_SCHEMA, library: { title: 'Covered', type: AppLibraryType.Novel, cover: 'cover.jpg', novel: null }, chapters: [] };
}

/** A manifest whose novel block carries `description`, for the synopsis cases. */
function manifestWithDescription(description: string) {
  return {
    schema: LIBRARY_PACKAGE_SCHEMA,
    library: {
      title: 'Described',
      type: AppLibraryType.Novel,
      cover: null,
      novel: { status: NovelStatus.Ongoing, author: 'A', language: 'zh', genres: [], description },
    },
    chapters: [],
  };
}

/** Bytes that open with a format's signature — enough for sniffing, without shipping a real image. */
function imageBytes(magic: number[], tail = 'body'): Buffer {
  return Buffer.concat([Buffer.from(magic), Buffer.from(tail)]);
}

describe('previewLibraryPackage', () => {
  it('reports what an archive holds without creating anything', () => {
    const library = seedLibrary(db, AppLibraryType.Novel, { title: 'Preview Me' });
    seedChapter(library.id, 1, 'One', 'body');
    seedChapter(library.id, 2, 'Two', '');

    const preview = previewLibraryPackage(buildLibraryPackage(db, library.id).data);

    expect(preview).toEqual({
      title: 'Preview Me',
      type: AppLibraryType.Novel,
      author: 'Author',
      language: 'en',
      description: null,
      cover: null,
      chapterCount: 2,
      bodyCount: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM app_libraries').get()).toEqual({ n: 1 });
  });

  it('rejects an archive that carries no manifest', () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('not a package'));
    expect(() => previewLibraryPackage(zip.toBuffer())).toThrow(/not a library package/);
  });

  it('rejects a package written by a newer schema than this app reads', () => {
    const data = zipWithManifest({ schema: LIBRARY_PACKAGE_SCHEMA + 1, library: { title: 'x', type: AppLibraryType.Novel }, chapters: [] });
    expect(() => previewLibraryPackage(data)).toThrow(/newer version/);
  });

  it('rejects a package naming a library type this app does not know', () => {
    const data = zipWithManifest({ schema: LIBRARY_PACKAGE_SCHEMA, library: { title: 'x', type: 'hologram' }, chapters: [] });
    expect(() => previewLibraryPackage(data)).toThrow(/unknown library type/);
  });

  it('returns the cover inline as a data URL, ready for an <img src>', () => {
    const jpeg = imageBytes([0xff, 0xd8, 0xff]);

    const { cover } = previewLibraryPackage(zipWithManifest(coveredManifest(), { 'cover.jpg': jpeg }));

    expect(cover).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
  });

  it('reads the media type from the bytes, not the entry name', () => {
    const png = imageBytes([0x89, 0x50, 0x4e, 0x47]);

    // The entry is called cover.jpg, but its bytes say PNG — the bytes win.
    const { cover } = previewLibraryPackage(zipWithManifest(coveredManifest(), { 'cover.jpg': png }));

    expect(cover).toBe(`data:image/png;base64,${png.toString('base64')}`);
  });

  it('reports no cover when the entry is not an image at all', () => {
    const data = zipWithManifest(coveredManifest(), { 'cover.jpg': Buffer.from('plainly not an image') });

    expect(previewLibraryPackage(data).cover).toBeNull();
  });

  it('reports no cover when the manifest names one the archive does not hold', () => {
    expect(previewLibraryPackage(zipWithManifest(coveredManifest())).cover).toBeNull();
  });

  it('carries the synopsis through, paragraph breaks and all', () => {
    const data = zipWithManifest(manifestWithDescription('First paragraph.\nSecond paragraph.'));

    expect(previewLibraryPackage(data).description).toBe('First paragraph.\nSecond paragraph.');
  });

  it('reports no description when the package stores only whitespace', () => {
    expect(previewLibraryPackage(zipWithManifest(manifestWithDescription('   \n  '))).description).toBeNull();
  });

  it('reports no description when the package has no novel block at all', () => {
    expect(previewLibraryPackage(zipWithManifest(coveredManifest())).description).toBeNull();
  });
});

describe('importLibraryPackage', () => {
  it('round-trips an exported item, chapters and all', () => {
    const source = seedLibrary(db, AppLibraryType.Novel, { title: 'Round Trip' });
    seedChapter(source.id, 1, 'One', 'first body');
    seedChapter(source.id, 2, 'Two', 'second body');

    const importedId = importLibraryPackage(db, buildLibraryPackage(db, source.id).data);
    const imported = getAppLibrary(db, importedId)!;
    const chapters = listAppLibraryContents(db, importedId);

    expect(importedId).not.toBe(source.id);
    expect(imported).toMatchObject({ title: 'Round Trip', type: AppLibraryType.Novel });
    expect(imported.novelMetadata).toMatchObject({ author: 'Author', language: 'en', discoveredCount: 2, downloadedCount: 2 });
    expect(chapters.map((chapter) => [chapter.idx, chapter.textContent?.title, chapter.textContent?.body])).toEqual([
      [1, 'One', 'first body'],
      [2, 'Two', 'second body'],
    ]);
  });

  it('keeps a body-less chapter as a placeholder, counted but not downloaded', () => {
    const source = seedLibrary(db, AppLibraryType.Novel);
    seedChapter(source.id, 1, 'Not fetched yet', '');

    const imported = getAppLibrary(db, importLibraryPackage(db, buildLibraryPackage(db, source.id).data))!;
    const [chapter] = listAppLibraryContents(db, imported.id);

    expect(imported.novelMetadata).toMatchObject({ discoveredCount: 1, downloadedCount: 0 });
    expect(chapter.textContent?.body).toBe('');
  });

  it('creates a second item rather than merging when the same package is imported twice', () => {
    const source = seedLibrary(db, AppLibraryType.Novel, { title: 'Twice' });
    seedChapter(source.id, 1, 'One', 'body');
    const { data } = buildLibraryPackage(db, source.id);

    const first = importLibraryPackage(db, data);
    const second = importLibraryPackage(db, data);

    expect(first).not.toBe(second);
    expect(db.prepare("SELECT COUNT(*) AS n FROM app_libraries WHERE title = 'Twice'").get()).toEqual({ n: 3 });
  });
});
