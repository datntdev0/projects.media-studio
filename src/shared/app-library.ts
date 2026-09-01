// Types and IPC contract shared between the main process, the preload
// bridge, and the renderer for the library entity — stored locally in the
// `app_libraries` SQLite table (see
// database/migrations/V0.1.0__create_app_info.sql). Field names and enum
// values follow the same-named entity in the companion Firestore-backed
// backend/frontend project, so the two stay easy to reconcile later.

export enum AppLibraryType {
  Novel = 'novel',
  Image = 'image',
  Video = 'video',
}

export enum NovelStatus {
  Ongoing = 'ongoing',
  Complete = 'complete',
  Hiatus = 'hiatus',
}

/** The base properties of an app library's metadata. */
export interface AppLibraryMetadataBase {
  discoveredCount: number;
  downloadedCount: number;
  discoveredAt: number | null;
}

export interface NovelMetadata extends AppLibraryMetadataBase {
  status: NovelStatus;
  author: string;
  language: string;
  genres: string[];
  description: string;
}

export interface ImageSetMetadata extends AppLibraryMetadataBase {
  downloadedSize: number;
}

export interface VideoSetMetadata extends AppLibraryMetadataBase {
  downloadedSize: number;
  downloadedDuration: number;
}

/** A row of the library listing — a novel, an image set, or a video set. */
export interface AppLibrary {
  id: string;
  title: string;
  type: AppLibraryType;
  coverUrl: string | null;
  novelMetadata: NovelMetadata | null;
  imageMetadata: ImageSetMetadata | null;
  videoMetadata: VideoSetMetadata | null;
  createdAt: number;
  updatedAt: number;
}

/** What a caller hands over to create or fully replace an item — the id and the dates are the repository's to stamp. */
export type AppLibraryDraft = Omit<AppLibrary, 'id' | 'createdAt' | 'updatedAt'>;

/** What the repository itself narrows a listing by: one column, equality only. */
export interface ListAppLibrariesFilter {
  type?: AppLibraryType;
}

/** The descriptive fields a novel carries beyond the counters every item type has. */
export type NovelDetails = Omit<NovelMetadata, keyof AppLibraryMetadataBase>;

/** What a caller asks for when adding an item — the manager fills in the counters. */
export interface CreateAppLibraryInput {
  title: string;
  type: AppLibraryType;
  coverUrl?: string | null;
  /** Required when `type` is `Novel`, ignored otherwise. */
  novel?: NovelDetails;
}

/** An item's type can't change after creation, so this is everything else in `CreateAppLibraryInput`. */
export type UpdateAppLibraryInput = Partial<Omit<CreateAppLibraryInput, 'type'>>;

export const APP_LIBRARY_IPC_CHANNELS = {
  list: 'app-library:list',
  get: 'app-library:get',
  create: 'app-library:create',
  update: 'app-library:update',
  remove: 'app-library:remove',
  uploadCover: 'app-library:upload-cover',
} as const;

export interface AppLibraryApi {
  list(filter?: ListAppLibrariesFilter): Promise<AppLibrary[]>;
  get(id: string): Promise<AppLibrary | null>;
  create(input: CreateAppLibraryInput): Promise<AppLibrary>;
  update(id: string, input: UpdateAppLibraryInput): Promise<AppLibrary>;
  remove(id: string): Promise<void>;
  /** Saves a locally picked cover file and returns the URL a library item's `coverUrl` can be set to. */
  uploadCover(fileName: string, contentType: string, data: ArrayBuffer): Promise<string>;
}
