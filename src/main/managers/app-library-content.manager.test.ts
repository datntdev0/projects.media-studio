import { beforeEach, describe, expect, it } from 'vitest';
import { createAppLibraryContentManager } from './app-library-content.manager';
import { createTestDb } from '../database/test-db';
import { seedLibrary } from '../database/test-fixtures';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import type { Db } from '../database/client';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage, type CreateAppLibraryContentInput } from '../../shared/app-library-content';
import { AppLibraryType } from '../../shared/app-library';

let db: Db;

function originalInput(overrides: Partial<CreateAppLibraryContentInput> = {}): CreateAppLibraryContentInput {
  return {
    idx: 1,
    type: AppLibraryContentType.Original,
    status: AppLibraryContentStatus.Pending,
    textContent: { body: 'Once upon a time.', language: ContentLanguage.English, title: 'Chapter 1' },
    ...overrides,
  };
}

beforeEach(() => {
  db = createTestDb();
});

describe('app library content manager', () => {
  it('create() rejects content types not allowed on the library item', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    const input: CreateAppLibraryContentInput = { idx: 1, type: AppLibraryContentType.Image, status: AppLibraryContentStatus.Pending, imageContent: { filename: 'a.png', filesize: 1, dimensions: '1x1' } };

    expect(() => manager.create(libraryId, input)).toThrow(/cannot hold 'image' content/);
  });

  it('create() rejects a status other than pending/completed', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    expect(() => manager.create(libraryId, originalInput({ status: AppLibraryContentStatus.Discovered }))).toThrow(/cannot be set directly/);
  });

  it('create() rejects a content block mismatched with its type', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    expect(() => manager.create(libraryId, originalInput({ textContent: null }))).toThrow(/must set exactly 'textContent'/);
  });

  it('create() rejects text content with a blank title', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    expect(() => manager.create(libraryId, originalInput({ textContent: { body: 'text', language: ContentLanguage.English, title: '  ' } }))).toThrow(/requires a title/);
  });

  it('create() throws for a library item that does not exist', () => {
    const manager = createAppLibraryContentManager(db);
    expect(() => manager.create('missing', originalInput())).toThrow(/not found/);
  });

  it('create() persists the content and recounts the parent novel item', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    const created = manager.create(libraryId, originalInput({ status: AppLibraryContentStatus.Completed }));

    expect(manager.get(libraryId, created.id)).toEqual(created);
    const item = getAppLibrary(db, libraryId)!;
    expect(item.novelMetadata).toMatchObject({ discoveredCount: 1, downloadedCount: 1 });
    expect(item.novelMetadata!.discoveredAt).not.toBeNull();
  });

  it('recount only counts completed content toward downloadedCount, and pending toward discoveredCount only', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    manager.create(libraryId, originalInput({ idx: 1, status: AppLibraryContentStatus.Pending }));
    manager.create(libraryId, originalInput({ idx: 2, status: AppLibraryContentStatus.Completed }));

    const item = getAppLibrary(db, libraryId)!;
    expect(item.novelMetadata).toMatchObject({ discoveredCount: 2, downloadedCount: 1 });
  });

  it('recount sums downloadedSize/downloadedDuration for a video item', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Video).id;
    const manager = createAppLibraryContentManager(db);
    const videoInput = (idx: number, filesize: number, duration: number): CreateAppLibraryContentInput => ({
      idx,
      type: AppLibraryContentType.Video,
      status: AppLibraryContentStatus.Completed,
      videoContent: { filename: `v${idx}.mp4`, filesize, dimensions: '1920x1080', duration },
    });

    manager.create(libraryId, videoInput(1, 100, 10));
    manager.create(libraryId, videoInput(2, 200, 20));

    const item = getAppLibrary(db, libraryId)!;
    expect(item.videoMetadata).toMatchObject({ discoveredCount: 2, downloadedCount: 2, downloadedSize: 300, downloadedDuration: 30 });
  });

  it('recount keeps the original discoveredAt once set', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);

    manager.create(libraryId, originalInput());
    const firstDiscoveredAt = getAppLibrary(db, libraryId)!.novelMetadata!.discoveredAt;

    manager.create(libraryId, originalInput({ idx: 2 }));
    const secondDiscoveredAt = getAppLibrary(db, libraryId)!.novelMetadata!.discoveredAt;

    expect(secondDiscoveredAt).toBe(firstDiscoveredAt);
  });

  it('update() rejects changing the content type', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    const created = manager.create(libraryId, originalInput());

    expect(() => manager.update(libraryId, created.id, { ...originalInput(), type: AppLibraryContentType.Translation, textContent: { ...originalInput().textContent!, language: ContentLanguage.Chinese } })).toThrow(
      /cannot change after creation/,
    );
  });

  it('update() re-triggers a recount', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    const created = manager.create(libraryId, originalInput({ status: AppLibraryContentStatus.Pending }));

    manager.update(libraryId, created.id, originalInput({ status: AppLibraryContentStatus.Completed }));

    const item = getAppLibrary(db, libraryId)!;
    expect(item.novelMetadata).toMatchObject({ downloadedCount: 1 });
  });

  it('remove() deletes the content and recounts the parent item back down', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    const created = manager.create(libraryId, originalInput({ status: AppLibraryContentStatus.Completed }));

    manager.remove(libraryId, created.id);

    expect(manager.get(libraryId, created.id)).toBeUndefined();
    const item = getAppLibrary(db, libraryId)!;
    expect(item.novelMetadata).toMatchObject({ discoveredCount: 0, downloadedCount: 0 });
  });

  it('remove() throws for content that does not exist', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    expect(() => manager.remove(libraryId, 'missing')).toThrow(/not found/);
  });

  it('list() filters by type/status/language', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppLibraryContentManager(db);
    manager.create(libraryId, originalInput({ idx: 1, status: AppLibraryContentStatus.Pending }));
    manager.create(libraryId, originalInput({ idx: 2, status: AppLibraryContentStatus.Completed, textContent: { body: 'x', language: ContentLanguage.Chinese, title: 'Ch2' } }));

    expect(manager.list(libraryId)).toHaveLength(2);
    expect(manager.list(libraryId, { status: AppLibraryContentStatus.Completed })).toHaveLength(1);
    expect(manager.list(libraryId, { language: ContentLanguage.Chinese })).toHaveLength(1);
  });
});
