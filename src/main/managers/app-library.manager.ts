import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Db } from '../database/client';
import {
  createAppLibrary,
  deleteAppLibrary,
  getAppLibrary,
  listAppLibraries,
  updateAppLibrary,
} from '../database/repositories/app-library.repo';
import { COVER_EXTENSION_BY_CONTENT_TYPE, deleteCoverFile, writeCoverFile } from '../helpers/cover-storage';
import {
  AppLibraryStatus,
  AppLibraryType,
  type AppLibrary,
  type AppLibraryDraft,
  type AppLibraryMetadataBase,
  type CreateAppLibraryInput,
  type ListAppLibrariesFilter,
  type UpdateAppLibraryInput,
} from '../../shared/app-library';

export interface AppLibraryManager {
  get(id: string): AppLibrary | undefined;
  list(filter?: ListAppLibrariesFilter): AppLibrary[];
  create(input: CreateAppLibraryInput): AppLibrary;
  update(id: string, input: UpdateAppLibraryInput): AppLibrary;
  remove(id: string): void;
  uploadCover(fileName: string, contentType: string, data: Buffer): string;
}

const EMPTY_COUNTERS: AppLibraryMetadataBase = { discoveredCount: 0, downloadedCount: 0, discoveredAt: null };

function stripStamps(item: AppLibrary): AppLibraryDraft {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = item;
  return draft;
}

/** Builds the type-specific metadata block a freshly created item starts with. */
function initialMetadata(input: CreateAppLibraryInput): Pick<AppLibraryDraft, 'novelMetadata' | 'imageMetadata' | 'videoMetadata'> {
  switch (input.type) {
    case AppLibraryType.Novel: {
      if (!input.novel) {
        throw new Error('Novel items require novel details (status, author, language, genres, description).');
      }
      return { novelMetadata: { ...EMPTY_COUNTERS, ...input.novel }, imageMetadata: null, videoMetadata: null };
    }
    case AppLibraryType.Image:
      return { novelMetadata: null, imageMetadata: { ...EMPTY_COUNTERS, downloadedSize: 0 }, videoMetadata: null };
    case AppLibraryType.Video:
      return { novelMetadata: null, imageMetadata: null, videoMetadata: { ...EMPTY_COUNTERS, downloadedSize: 0, downloadedDuration: 0 } };
  }
}

export function createAppLibraryManager(db: Db): AppLibraryManager {
  const need = (id: string): AppLibrary => {
    const item = getAppLibrary(db, id);
    if (!item) {
      throw new Error(`Library item ${id} not found`);
    }
    return item;
  };

  return {
    get: (id) => getAppLibrary(db, id),

    list: (filter) => listAppLibraries(db, filter),

    create: (input) =>
      createAppLibrary(db, {
        title: input.title,
        type: input.type,
        status: AppLibraryStatus.Draft,
        sourceMode: input.sourceMode,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl ?? null,
        coverUrl: input.coverUrl ?? null,
        ...initialMetadata(input),
      }),

    update: (id, input) => {
      const current = need(id);
      const draft = stripStamps(current);

      if (input.title !== undefined) draft.title = input.title;
      if (input.sourceMode !== undefined) draft.sourceMode = input.sourceMode;
      if (input.sourceName !== undefined) draft.sourceName = input.sourceName;
      if (input.sourceUrl !== undefined) draft.sourceUrl = input.sourceUrl;
      if (input.coverUrl !== undefined) draft.coverUrl = input.coverUrl;
      if (input.novel && draft.novelMetadata) draft.novelMetadata = { ...draft.novelMetadata, ...input.novel };

      if (input.coverUrl !== undefined && input.coverUrl !== current.coverUrl) deleteCoverFile(current.coverUrl);

      return updateAppLibrary(db, id, draft);
    },

    remove: (id) => {
      deleteCoverFile(need(id).coverUrl);
      deleteAppLibrary(db, id);
    },

    uploadCover: (fileName, contentType, data) => {
      const extension = COVER_EXTENSION_BY_CONTENT_TYPE[contentType] || path.extname(fileName).replace('.', '') || 'jpg';
      return writeCoverFile(`${randomUUID()}.${extension}`, data);
    },
  };
}
