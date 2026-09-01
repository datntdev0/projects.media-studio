import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppWorkspaceManager } from './app-workspace.manager';
import { createAppLibraryManager } from './app-library.manager';
import { createTestDb } from '@/main/database/test-db';
import type { Db } from '@/main/database/client';
import { AppLibraryType, NovelStatus } from '@/shared/app-library';
import { WorkspacePreset, WorkspaceStatus, WorkspaceStepKey, WorkspaceStepState, type CreateAppWorkspaceInput } from '@/shared/app-workspace';

vi.mock('@/main/helpers/cover-storage', () => ({
  COVER_EXTENSION_BY_CONTENT_TYPE: { 'image/png': 'png' },
  writeCoverFile: vi.fn(() => 'app-cover://cover/generated.png'),
  deleteCoverFile: vi.fn(),
}));

let db: Db;

function addNovel(title = 'My Novel'): string {
  return createAppLibraryManager(db).create({
    title,
    type: AppLibraryType.Novel,
    novel: { status: NovelStatus.Ongoing, author: 'Author', language: 'en', genres: [], description: '' },
  }).id;
}

function workspaceInput(libraryId: string, overrides: Partial<CreateAppWorkspaceInput> = {}): CreateAppWorkspaceInput {
  return { name: 'My Novel — Audio VN', description: '', preset: WorkspacePreset.AudioNovel, libraryId, translateEnabled: true, ...overrides };
}

beforeEach(() => {
  db = createTestDb();
  vi.clearAllMocks();
});

describe('app workspace manager', () => {
  it('create() persists a draft workspace with its pipeline, and get() reads it back', () => {
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(addNovel()));

    expect(created.status).toBe(WorkspaceStatus.Draft);
    expect(created.lastRunAt).toBeNull();
    expect(created.steps).toEqual([
      { key: WorkspaceStepKey.SemanticAnalysis, idx: 1, state: WorkspaceStepState.Pending, doneCount: 0, failedCount: 0, totalCount: 0 },
      { key: WorkspaceStepKey.SemanticTranslate, idx: 2, state: WorkspaceStepState.Pending, doneCount: 0, failedCount: 0, totalCount: 0 },
      { key: WorkspaceStepKey.NarrationSpeech, idx: 3, state: WorkspaceStepState.Pending, doneCount: 0, failedCount: 0, totalCount: 0 },
      { key: WorkspaceStepKey.Export, idx: 5, state: WorkspaceStepState.Pending, doneCount: 0, failedCount: 0, totalCount: 0 },
    ]);
    expect(manager.get(created.id)).toEqual(created);
  });

  it('create() leaves out the translate step when it is toggled off, keeping the preset numbering', () => {
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(addNovel(), { translateEnabled: false }));

    expect(created.steps.map((step) => step.key)).toEqual([WorkspaceStepKey.SemanticAnalysis, WorkspaceStepKey.NarrationSpeech, WorkspaceStepKey.Export]);
    expect(created.steps.map((step) => step.idx)).toEqual([1, 3, 5]);
  });

  it('create() trims the name and description, and rejects an empty name', () => {
    const manager = createAppWorkspaceManager(db);
    const libraryId = addNovel();

    expect(manager.create(workspaceInput(libraryId, { name: '  Spaced  ', description: '  note  ' }))).toMatchObject({ name: 'Spaced', description: 'note' });
    expect(() => manager.create(workspaceInput(libraryId, { name: '   ' }))).toThrow(/needs a name/);
    expect(manager.list()).toHaveLength(1);
  });

  it('create() rejects an unknown library, a non-novel item, and an unavailable preset', () => {
    const manager = createAppWorkspaceManager(db);
    const imageId = createAppLibraryManager(db).create({ title: 'Shots', type: AppLibraryType.Image }).id;

    expect(() => manager.create(workspaceInput('missing-id'))).toThrow(/not found/);
    expect(() => manager.create(workspaceInput(imageId))).toThrow(/library novel/);
    expect(() => manager.create(workspaceInput(addNovel(), { preset: WorkspacePreset.VideoRecap }))).toThrow(/not available yet/);
    expect(manager.list()).toHaveLength(0);
  });

  it('list() filters by status and preset', () => {
    const manager = createAppWorkspaceManager(db);
    manager.create(workspaceInput(addNovel()));

    expect(manager.list({ status: WorkspaceStatus.Draft })).toHaveLength(1);
    expect(manager.list({ status: WorkspaceStatus.Running })).toHaveLength(0);
    expect(manager.list({ preset: WorkspacePreset.AudioNovel })).toHaveLength(1);
    expect(manager.list({ preset: WorkspacePreset.VideoRecap })).toHaveLength(0);
  });

  it('update() rewrites the name and description, leaving the pipeline alone', () => {
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(addNovel()));

    const updated = manager.update(created.id, { name: '  Renamed  ', description: '  a note  ' });

    expect(updated).toMatchObject({ name: 'Renamed', description: 'a note', status: WorkspaceStatus.Draft });
    expect(updated.steps).toEqual(created.steps);
    expect(manager.get(created.id)).toEqual(updated);
  });

  it('update() keeps a field that is left out, and rejects a blank name or an unknown id', () => {
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(addNovel(), { description: 'kept' }));

    expect(manager.update(created.id, { name: 'Only the name' })).toMatchObject({ name: 'Only the name', description: 'kept' });
    expect(() => manager.update(created.id, { name: '  ' })).toThrow(/needs a name/);
    expect(() => manager.update('missing-id', { name: 'x' })).toThrow(/not found/);
    expect(manager.get(created.id)).toMatchObject({ name: 'Only the name' });
  });

  it('remove() deletes the workspace and its steps, and rejects an unknown id', () => {
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(addNovel()));

    manager.remove(created.id);

    expect(manager.get(created.id)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) AS count FROM app_workspace_steps').get()).toEqual({ count: 0 });
    expect(() => manager.remove(created.id)).toThrow(/not found/);
  });

  it('keeps a workspace when the novel it references is deleted', () => {
    const libraryId = addNovel();
    const manager = createAppWorkspaceManager(db);
    const created = manager.create(workspaceInput(libraryId));

    createAppLibraryManager(db).remove(libraryId);

    expect(manager.get(created.id)).toMatchObject({ libraryId });
  });
});
