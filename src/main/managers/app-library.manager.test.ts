import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppLibraryManager } from './app-library.manager';
import { createTestDb } from '@/main/database/test-db';
import { createAppLibraryContent } from '@/main/database/repositories/app-library-content.repo';
import type { Db } from '@/main/database/client';
import { AppLibraryContentStatus, AppLibraryContentType } from '@/shared/app-library-content';
import { AppLibraryType, NovelStatus, type CreateAppLibraryInput } from '@/shared/app-library';

vi.mock('@/main/helpers/cover-storage', () => ({
  COVER_EXTENSION_BY_CONTENT_TYPE: { 'image/png': 'png' },
  writeCoverFile: vi.fn(() => 'app-cover://cover/generated.png'),
  deleteCoverFile: vi.fn(),
}));

const NOVEL_INPUT: CreateAppLibraryInput = {
  title: 'My Novel',
  type: AppLibraryType.Novel,
  novel: { status: NovelStatus.Ongoing, author: 'Author', language: 'en', genres: [], description: '' },
};

let db: Db;

beforeEach(() => {
  db = createTestDb();
  vi.clearAllMocks();
});

describe('app library manager', () => {
  it('create() persists a new item and get() reads it back', () => {
    const manager = createAppLibraryManager(db);
    const created = manager.create(NOVEL_INPUT);

    expect(created.id).toBeTruthy();
    expect(created.novelMetadata).toMatchObject({ discoveredCount: 0, downloadedCount: 0, author: 'Author' });
    expect(manager.get(created.id)).toEqual(created);
  });

  it('create() rejects a novel without novel details, without touching the database', () => {
    const manager = createAppLibraryManager(db);
    expect(() => manager.create({ title: 'x', type: AppLibraryType.Novel })).toThrow(/Novel items require/);
    expect(manager.list()).toHaveLength(0);
  });

  it('list() filters by type', () => {
    const manager = createAppLibraryManager(db);
    manager.create(NOVEL_INPUT);
    manager.create({ title: 'My Images', type: AppLibraryType.Image });

    expect(manager.list()).toHaveLength(2);
    expect(manager.list({ type: AppLibraryType.Novel })).toHaveLength(1);
    expect(manager.list({ type: AppLibraryType.Video })).toHaveLength(0);
  });

  it('update() merges partial input onto the existing item and bumps updatedAt', () => {
    const manager = createAppLibraryManager(db);
    const created = manager.create(NOVEL_INPUT);

    const updated = manager.update(created.id, { title: 'New Title' });

    expect(updated.title).toBe('New Title');
    expect(updated.novelMetadata).toEqual(created.novelMetadata);
    expect(manager.get(created.id)?.title).toBe('New Title');
  });

  it('update() throws for an item that does not exist', () => {
    const manager = createAppLibraryManager(db);
    expect(() => manager.update('missing', { title: 'x' })).toThrow(/not found/);
  });

  it('update() deletes the old cover file when coverUrl changes', async () => {
    const { deleteCoverFile } = await import('@/main/helpers/cover-storage');
    const manager = createAppLibraryManager(db);
    const created = manager.create({ ...NOVEL_INPUT, coverUrl: 'app-cover://cover/old.jpg' });

    manager.update(created.id, { coverUrl: 'app-cover://cover/new.jpg' });

    expect(deleteCoverFile).toHaveBeenCalledWith('app-cover://cover/old.jpg');
  });

  it('update() leaves the cover alone when coverUrl is not part of the input', async () => {
    const { deleteCoverFile } = await import('@/main/helpers/cover-storage');
    const manager = createAppLibraryManager(db);
    const created = manager.create({ ...NOVEL_INPUT, coverUrl: 'app-cover://cover/old.jpg' });

    manager.update(created.id, { title: 'New Title' });

    expect(deleteCoverFile).not.toHaveBeenCalled();
  });

  it('remove() deletes the item and cascades its contents', () => {
    const manager = createAppLibraryManager(db);
    const created = manager.create(NOVEL_INPUT);
    createAppLibraryContent(db, created.id, { idx: 1, type: AppLibraryContentType.Original, status: AppLibraryContentStatus.Completed });

    manager.remove(created.id);

    expect(manager.get(created.id)).toBeUndefined();
    const remaining = db.prepare('SELECT COUNT(*) as count FROM app_library_contents WHERE library_id = ?').get(created.id) as { count: number };
    expect(remaining.count).toBe(0);
  });

  it('remove() throws for an item that does not exist', () => {
    const manager = createAppLibraryManager(db);
    expect(() => manager.remove('missing')).toThrow(/not found/);
  });

  it('uploadCover() picks the extension for the given content type', async () => {
    const { writeCoverFile } = await import('@/main/helpers/cover-storage');
    const manager = createAppLibraryManager(db);
    const url = manager.uploadCover('picture', 'image/png', Buffer.from('data'));

    expect(url).toBe('app-cover://cover/generated.png');
    const [fileName] = vi.mocked(writeCoverFile).mock.calls[0];
    expect(fileName).toMatch(/\.png$/);
  });
});
