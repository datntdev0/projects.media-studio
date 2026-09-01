// Types and IPC contract for a library item's content rows — chapters for a
// novel, files for an image/video set. Field names and enum values mirror
// the same-named entity in the companion Firestore-backed backend project
// (see backend/src/library/entities/library-content.entity.ts there), same
// reasoning as shared/app-library.ts. Two differences, both because this app
// is a local, single-user desktop app rather than a cloud service:
//  - a chapter's text lives in a `.txt` file on disk rather than a blob in
//    cloud storage; `contentPath` records where, and `body` is read from and
//    written back to that file so callers still see the text inline.
//  - listing has no cursor pagination — a local item's content count is
//    small enough to always return the full, filtered list.

import { AppLibraryType } from './app-library';

export enum AppLibraryContentType {
  Original = 'original',
  Translation = 'translation',
  Image = 'image',
  Video = 'video',
}

/** `Discovered`/`Failed` come in with an imported package — a caller may only write `Pending` or `Completed`. */
export enum AppLibraryContentStatus {
  Discovered = 'discovered',
  Pending = 'pending',
  Completed = 'completed',
  Failed = 'failed',
}

export enum ContentLanguage {
  Vietnamese = 'vi',
  English = 'en',
  Chinese = 'zh',
}

export interface TextContentBlock {
  /** The chapter's text. Stored in the file `contentPath` names, not in the database row. */
  body: string;
  language: ContentLanguage;
  title: string;
}

export interface ImageContentBlock {
  filename: string;
  filesize: number;
  dimensions: string;
}

export interface VideoContentBlock {
  filename: string;
  filesize: number;
  dimensions: string;
  duration: number;
}

/** One content row belonging to a library item. Exactly one of the three blocks is set, matching `type`. */
export interface AppLibraryContent {
  id: string;
  libraryId: string;
  idx: number;
  type: AppLibraryContentType;
  status: AppLibraryContentStatus;
  /** Where this row's payload lives, relative to the app data directory. Null until something has been written. Set by the repository, never by a caller. */
  contentPath: string | null;
  textContent: TextContentBlock | null;
  imageContent: ImageContentBlock | null;
  videoContent: VideoContentBlock | null;
  createdAt: number;
  updatedAt: number;
}

/** Create and update both replace the row wholesale — there is no partial-patch shape. `type` cannot change on update. */
export interface CreateAppLibraryContentInput {
  idx: number;
  type: AppLibraryContentType;
  status: AppLibraryContentStatus;
  textContent?: TextContentBlock | null;
  imageContent?: ImageContentBlock | null;
  videoContent?: VideoContentBlock | null;
}

export type UpdateAppLibraryContentInput = CreateAppLibraryContentInput;

export interface ListAppLibraryContentsFilter {
  type?: AppLibraryContentType;
  status?: AppLibraryContentStatus;
  language?: ContentLanguage;
}

/** Which content types a library item's own type may hold. */
export const ALLOWED_CONTENT_TYPES: Record<AppLibraryType, AppLibraryContentType[]> = {
  [AppLibraryType.Novel]: [AppLibraryContentType.Original, AppLibraryContentType.Translation],
  [AppLibraryType.Image]: [AppLibraryContentType.Image],
  [AppLibraryType.Video]: [AppLibraryContentType.Video],
};

export const APP_LIBRARY_CONTENT_IPC_CHANNELS = {
  list: 'app-library-content:list',
  get: 'app-library-content:get',
  create: 'app-library-content:create',
  update: 'app-library-content:update',
  remove: 'app-library-content:remove',
} as const;

export interface AppLibraryContentApi {
  list(libraryId: string, filter?: ListAppLibraryContentsFilter): Promise<AppLibraryContent[]>;
  get(libraryId: string, id: string): Promise<AppLibraryContent | null>;
  create(libraryId: string, input: CreateAppLibraryContentInput): Promise<AppLibraryContent>;
  update(libraryId: string, id: string, input: UpdateAppLibraryContentInput): Promise<AppLibraryContent>;
  remove(libraryId: string, id: string): Promise<void>;
}
