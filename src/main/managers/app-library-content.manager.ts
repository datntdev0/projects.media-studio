import type { Db } from '../database/client';
import { getAppLibrary, updateAppLibrary } from '../database/repositories/app-library.repo';
import { createAppLibraryContent, deleteAppLibraryContent, getAppLibraryContent, listAppLibraryContents, updateAppLibraryContent } from '../database/repositories/app-library-content.repo';
import { stripStamps } from './app-library.manager';
import { AppLibraryType } from '../../shared/app-library';
import { ALLOWED_CONTENT_TYPES, AppLibraryContentStatus, AppLibraryContentType, type CreateAppLibraryContentInput, type AppLibraryContent, type ListAppLibraryContentsFilter, type UpdateAppLibraryContentInput } from '../../shared/app-library-content';

export interface AppLibraryContentManager {
  list(libraryId: string, filter?: ListAppLibraryContentsFilter): AppLibraryContent[];
  get(libraryId: string, id: string): AppLibraryContent | undefined;
  create(libraryId: string, input: CreateAppLibraryContentInput): AppLibraryContent;
  update(libraryId: string, id: string, input: UpdateAppLibraryContentInput): AppLibraryContent;
  remove(libraryId: string, id: string): void;
}

/** Only these two are writable through the manager — `discovered`/`failed` are written by an import, straight through the repository. */
const WRITABLE_STATUSES = new Set([AppLibraryContentStatus.Pending, AppLibraryContentStatus.Completed]);

function contentBlockKey(type: AppLibraryContentType): 'textContent' | 'imageContent' | 'videoContent' {
  switch (type) {
    case AppLibraryContentType.Original:
    case AppLibraryContentType.Translation:
      return 'textContent';
    case AppLibraryContentType.Image:
      return 'imageContent';
    case AppLibraryContentType.Video:
      return 'videoContent';
  }
}

function validate(libraryType: AppLibraryType, input: CreateAppLibraryContentInput): void {
  const allowed = ALLOWED_CONTENT_TYPES[libraryType];
  if (!allowed.includes(input.type)) {
    throw new Error(`A ${libraryType} item cannot hold '${input.type}' content. Allowed: ${allowed.join(', ')}`);
  }
  if (!WRITABLE_STATUSES.has(input.status)) {
    throw new Error(`Status '${input.status}' cannot be set directly; only 'pending' or 'completed' are writable here.`);
  }

  const expectedKey = contentBlockKey(input.type);
  const blockKeys = ['textContent', 'imageContent', 'videoContent'] as const;
  const present = blockKeys.filter((key) => input[key] != null);

  if (present.length !== 1 || present[0] !== expectedKey) {
    throw new Error(`Content of type '${input.type}' must set exactly '${expectedKey}' and no other content block (got: ${present.join(', ') || 'none'}).`);
  }

  if (expectedKey === 'textContent' && input.textContent && input.textContent.title.trim() === '') {
    throw new Error('Text content requires a title.');
  }
  if (expectedKey === 'imageContent' && input.imageContent && input.imageContent.filename.trim() === '') {
    throw new Error('Image content requires a filename.');
  }
  if (expectedKey === 'videoContent' && input.videoContent && input.videoContent.filename.trim() === '') {
    throw new Error('Video content requires a filename.');
  }
}

/**
 * Recomputes the parent item's discovered/downloaded counters from its actual content rows — a full
 * recount rather than an incremental delta, so the counters can never drift out of sync. Called after
 * every content mutation (not just discovery) so the library list's progress bar stays accurate.
 */
export function recount(db: Db, libraryId: string): void {
  const item = getAppLibrary(db, libraryId);
  if (!item) return;

  const contents = listAppLibraryContents(db, libraryId);
  const relevant = item.type === AppLibraryType.Novel ? contents.filter((c) => c.type === AppLibraryContentType.Original) : contents;
  const completed = relevant.filter((c) => c.status === AppLibraryContentStatus.Completed);
  const discoveredCount = relevant.length;
  const downloadedCount = completed.length;
  const discoveredAt = (current: number | null) => current ?? (discoveredCount > 0 ? Date.now() : null);

  const draft = stripStamps(item);

  if (item.type === AppLibraryType.Novel && draft.novelMetadata) {
    draft.novelMetadata = { ...draft.novelMetadata, discoveredCount, downloadedCount, discoveredAt: discoveredAt(draft.novelMetadata.discoveredAt) };
  } else if (item.type === AppLibraryType.Image && draft.imageMetadata) {
    const downloadedSize = completed.reduce((sum, c) => sum + (c.imageContent?.filesize ?? 0), 0);
    draft.imageMetadata = { ...draft.imageMetadata, discoveredCount, downloadedCount, downloadedSize, discoveredAt: discoveredAt(draft.imageMetadata.discoveredAt) };
  } else if (item.type === AppLibraryType.Video && draft.videoMetadata) {
    const downloadedSize = completed.reduce((sum, c) => sum + (c.videoContent?.filesize ?? 0), 0);
    const downloadedDuration = completed.reduce((sum, c) => sum + (c.videoContent?.duration ?? 0), 0);
    draft.videoMetadata = {
      ...draft.videoMetadata,
      discoveredCount,
      downloadedCount,
      downloadedSize,
      downloadedDuration,
      discoveredAt: discoveredAt(draft.videoMetadata.discoveredAt),
    };
  }

  updateAppLibrary(db, libraryId, draft);
}

export function createAppLibraryContentManager(db: Db): AppLibraryContentManager {
  const needItem = (libraryId: string) => {
    const item = getAppLibrary(db, libraryId);
    if (!item) throw new Error(`Library item ${libraryId} not found`);
    return item;
  };

  const needContent = (libraryId: string, id: string) => {
    const content = getAppLibraryContent(db, libraryId, id);
    if (!content) throw new Error(`Content ${id} not found on library item ${libraryId}`);
    return content;
  };

  return {
    list: (libraryId, filter) => listAppLibraryContents(db, libraryId, filter),

    get: (libraryId, id) => getAppLibraryContent(db, libraryId, id),

    create: (libraryId, input) => {
      const item = needItem(libraryId);
      validate(item.type, input);
      const created = createAppLibraryContent(db, libraryId, input);
      recount(db, libraryId);
      return created;
    },

    update: (libraryId, id, input) => {
      const item = needItem(libraryId);
      const current = needContent(libraryId, id);
      if (input.type !== current.type) {
        throw new Error(`Content type cannot change after creation (was '${current.type}').`);
      }
      validate(item.type, input);
      const updated = updateAppLibraryContent(db, libraryId, id, input);
      recount(db, libraryId);
      return updated;
    },

    remove: (libraryId, id) => {
      needContent(libraryId, id);
      deleteAppLibraryContent(db, libraryId, id);
      recount(db, libraryId);
    },
  };
}
