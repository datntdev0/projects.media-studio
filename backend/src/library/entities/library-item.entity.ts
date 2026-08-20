import { FirestoreEntity } from '../../core/firebase/firestore.repository';

export enum LibraryItemType {
  Novel = 'novel',
  Image = 'image',
  Video = 'video',
}

export enum LibrarySourceMode {
  Manual = 'manual',
  Crawler = 'crawler',
}

export enum LibraryItemStatus {
  Draft = 'draft',
  Scraping = 'scraping',
  Ready = 'ready',
  Failed = 'failed',
}

export enum NovelStatus {
  Ongoing = 'ongoing',
  Complete = 'complete',
  Hiatus = 'hiatus',
}

/** The base properties of a library item's metadata. */
export interface LibraryItemMetadataBase {
  discoveredCount: number;
  downloadedCount: number;
  discoveredAt: string | null;
}

/** Metadata specific to novels. */
export interface NovelMetadata extends LibraryItemMetadataBase {
  status: NovelStatus;
  author: string;
  language: string;
  genres: string[];
  description: string;
}

/** A set of images. */
export interface ImageSetMetadata extends LibraryItemMetadataBase {
  downloadedSize: number;
}

/** A set of videos: bytes, and how long they run. */
export interface VideoSetMetadata extends LibraryItemMetadataBase {
  downloadedSize: number;
  downloadedDuration: number;
}

/** The base properties of a library item, regardless of its type. */
export interface LibraryItem extends FirestoreEntity {
  id: string;
  title: string;
  type: LibraryItemType;
  status: LibraryItemStatus;
  sourceMode: LibrarySourceMode;
  sourceName: string;
  sourceUrl: string | null;
  coverUrl: string | null;
  novelMetadata: NovelMetadata | null;
  imageMetadata: ImageSetMetadata | null;
  videoMetadata: VideoSetMetadata | null;
  createdAt: string;
  updatedAt: string;
}
