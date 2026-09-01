import type { Db } from './client';
import { createAppLibrary } from './repositories/app-library.repo';
import { AppLibraryType, NovelStatus, type AppLibrary, type AppLibraryDraft } from '../../shared/app-library';

const EMPTY_COUNTERS = { discoveredCount: 0, downloadedCount: 0, discoveredAt: null };

function metadataFor(type: AppLibraryType): Pick<AppLibraryDraft, 'novelMetadata' | 'imageMetadata' | 'videoMetadata'> {
  switch (type) {
    case AppLibraryType.Novel:
      return { novelMetadata: { ...EMPTY_COUNTERS, status: NovelStatus.Ongoing, author: 'Author', language: 'en', genres: [], description: '' }, imageMetadata: null, videoMetadata: null };
    case AppLibraryType.Image:
      return { novelMetadata: null, imageMetadata: { ...EMPTY_COUNTERS, downloadedSize: 0 }, videoMetadata: null };
    case AppLibraryType.Video:
      return { novelMetadata: null, imageMetadata: null, videoMetadata: { ...EMPTY_COUNTERS, downloadedSize: 0, downloadedDuration: 0 } };
  }
}

/** Seeds a library item directly through the repository — for tests of managers layered on top of one, without going through `AppLibraryManager` and its cover-storage side effects. */
export function seedLibrary(db: Db, type: AppLibraryType, overrides: Partial<AppLibraryDraft> = {}): AppLibrary {
  const draft: AppLibraryDraft = { title: 'Item', type, coverUrl: null, ...metadataFor(type), ...overrides };
  return createAppLibrary(db, draft);
}
