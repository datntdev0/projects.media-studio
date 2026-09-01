import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAppLibraryContent, deleteAppLibraryContent, getAppLibraryContent, listAppLibraryContents, updateAppLibraryContent } from './app-library-content.repo';
import { createTestDb } from '../test-db';
import { seedLibrary } from '../test-fixtures';
import { getAppDataDir } from '../../helpers/paths';
import type { Db } from '../client';
import { AppLibraryType } from '../../../shared/app-library';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage, type CreateAppLibraryContentInput } from '../../../shared/app-library-content';

let db: Db;
let libraryId: string;

beforeEach(() => {
  db = createTestDb();
  libraryId = seedLibrary(db, AppLibraryType.Novel).id;
});

function chapterInput(overrides: Partial<CreateAppLibraryContentInput> = {}): CreateAppLibraryContentInput {
  return {
    idx: 1,
    type: AppLibraryContentType.Original,
    status: AppLibraryContentStatus.Completed,
    textContent: { body: 'the chapter text', language: ContentLanguage.Chinese, title: 'One' },
    imageContent: null,
    videoContent: null,
    ...overrides,
  };
}

/** The `metadata` column as stored, so a test can assert what did *not* go into the row. */
function storedMetadataColumn(id: string): string | null {
  const row = db.prepare('SELECT metadata FROM app_library_contents WHERE id = ?').get(id) as { metadata: string | null };
  return row.metadata;
}

function absolute(relativePath: string): string {
  return path.join(getAppDataDir(), relativePath);
}

describe('a text content row', () => {
  it('writes its body to a file named after the library and chapter, not into the row', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());

    expect(created.contentPath).toBe(`libraries/novel.${libraryId}/chapter-0001.txt`);
    expect(fs.readFileSync(absolute(created.contentPath!), 'utf8')).toBe('the chapter text');
    expect(JSON.parse(storedMetadataColumn(created.id)!)).toEqual({ language: ContentLanguage.Chinese, title: 'One' });
  });

  it('reads the body back off disk, so callers still see it inline', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());

    expect(getAppLibraryContent(db, libraryId, created.id)?.textContent).toEqual({ body: 'the chapter text', language: ContentLanguage.Chinese, title: 'One' });
    expect(listAppLibraryContents(db, libraryId)[0].textContent?.body).toBe('the chapter text');
  });

  it('gives a translation its own file beside the original it shares an idx with', () => {
    const original = createAppLibraryContent(db, libraryId, chapterInput());
    const translation = createAppLibraryContent(
      db,
      libraryId,
      chapterInput({ type: AppLibraryContentType.Translation, textContent: { body: 'bản dịch', language: ContentLanguage.Vietnamese, title: 'Một' } }),
    );

    expect(translation.contentPath).toBe(`libraries/novel.${libraryId}/chapter-0001.vi.txt`);
    expect(translation.contentPath).not.toBe(original.contentPath);
    expect(fs.readFileSync(absolute(original.contentPath!), 'utf8')).toBe('the chapter text');
    expect(fs.readFileSync(absolute(translation.contentPath!), 'utf8')).toBe('bản dịch');
  });

  it('rewrites the file in place when only the body changes', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());

    const updated = updateAppLibraryContent(db, libraryId, created.id, chapterInput({ textContent: { body: 'edited', language: ContentLanguage.Chinese, title: 'One' } }));

    expect(updated.contentPath).toBe(created.contentPath);
    expect(fs.readFileSync(absolute(updated.contentPath!), 'utf8')).toBe('edited');
  });

  it('moves the file and drops the old one when the chapter is renumbered', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());
    const before = created.contentPath!;

    const updated = updateAppLibraryContent(db, libraryId, created.id, chapterInput({ idx: 7 }));

    expect(updated.contentPath).toBe(`libraries/novel.${libraryId}/chapter-0007.txt`);
    expect(fs.existsSync(absolute(before))).toBe(false);
    expect(fs.readFileSync(absolute(updated.contentPath!), 'utf8')).toBe('the chapter text');
  });

  it('deletes the file along with the row', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());

    deleteAppLibraryContent(db, libraryId, created.id);

    expect(fs.existsSync(absolute(created.contentPath!))).toBe(false);
    expect(getAppLibraryContent(db, libraryId, created.id)).toBeUndefined();
  });

  it('reads an empty body rather than failing when the file has gone missing', () => {
    const created = createAppLibraryContent(db, libraryId, chapterInput());
    fs.rmSync(absolute(created.contentPath!));

    expect(getAppLibraryContent(db, libraryId, created.id)?.textContent?.body).toBe('');
  });
});
