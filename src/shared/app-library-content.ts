// Types and IPC contract for a library item's content rows — chapters for a
// novel, files for an image/video set. Field names and enum values mirror
// the same-named entity in the companion Firestore-backed backend project
// (see backend/src/library/entities/library-content.entity.ts there), same
// reasoning as shared/app-library.ts. Two differences, both because this app
// is a local, single-user desktop app rather than a cloud service:
//  - text content stores its body inline (`body`) instead of pointing at a
//    blob in cloud storage — there is no blob store here. `contentUrl` is
//    kept in the shape (always null today) purely for parity.
//  - listing has no cursor pagination — a local item's content count is
//    small enough to always return the full, filtered list.

import { AppLibraryType } from './app-library';

export enum AppLibraryContentType {
  Original = 'original',
  Translation = 'translation',
  Audio = 'audio',
  Image = 'image',
  Video = 'video',
}

/** `Discovered`/`InProgress`/`Failed` are set by scraping/job code only — a caller may only write `Pending` or `Completed`. */
export enum AppLibraryContentStatus {
  Discovered = 'discovered',
  Pending = 'pending',
  InProgress = 'inprogress',
  Completed = 'completed',
  Failed = 'failed',
}

export enum ContentLanguage {
  Vietnamese = 'vi',
  English = 'en',
  Chinese = 'zh',
}

export interface TextContentBlock {
  contentUrl: string | null;
  body: string;
  language: ContentLanguage;
  title: string;
}

export interface AudioContentBlock {
  contentUrl: string | null;
  language: ContentLanguage;
  subtitleUrl: string | null;
}

export interface ImageContentBlock {
  contentUrl: string | null;
  filename: string;
  filesize: number;
  dimensions: string;
}

export interface VideoContentBlock {
  contentUrl: string | null;
  filename: string;
  filesize: number;
  dimensions: string;
  duration: number;
}

/** One content row belonging to a library item. Exactly one of the four blocks is set, matching `type`. */
export interface AppLibraryContent {
  id: string;
  libraryId: string;
  idx: number;
  type: AppLibraryContentType;
  status: AppLibraryContentStatus;
  sourceUrl: string | null;
  textContent: TextContentBlock | null;
  audioContent: AudioContentBlock | null;
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
  sourceUrl?: string | null;
  textContent?: TextContentBlock | null;
  audioContent?: AudioContentBlock | null;
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
