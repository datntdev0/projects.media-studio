import { FirestoreEntity } from '../../core/firebase/firestore.repository';
import type { ImageSetMetadata, NovelMetadata, VideoSetMetadata } from './library-item-metadata.entity';

/** What the item holds — and therefore what shape its `metadata` has. */
export enum LibraryItemType {
  Novel = 'novel',
  Image = 'image',
  Video = 'video',
}

/** Where its content comes from: a person, or a crawler reading a URL. */
export enum LibrarySourceMode {
  Manual = 'manual',
  Crawler = 'crawler',
}

/**
 * Where the item is in our pipeline.
 *
 * Split by ownership: a person sets `Draft` or `Ready`, while `Scraping` and
 * `Failed` belong to the job runner. Part 1 has no runner, so the write DTOs
 * reject those two rather than let a client claim a state nothing can produce.
 */
export enum LibraryItemStatus {
  Draft = 'draft',
  Scraping = 'scraping',
  Ready = 'ready',
  Failed = 'failed',
}

/**
 * The work's own status, as its source publishes it. Not `LibraryItemStatus`,
 * which is ours — only ours appears in the list's status filter.
 */
export enum NovelStatus {
  Ongoing = 'ongoing',
  Complete = 'complete',
  Hiatus = 'hiatus',
}

/**
 * What a row carries whatever its type. Everything type-specific lives under
 * `metadata`, so this shape does not change when a content type is added.
 */
export interface LibraryItemBase extends FirestoreEntity {
  id: string;
  title: string;
  /** Where the listing draws a thumbnail; the wireframe placeholder stays when null. */
  coverUrl: string | null;
  /** Immutable after creation, like `type`: it decides how the content arrives. */
  sourceMode: LibrarySourceMode;
  /** `Manual`, or the crawler's name. Free text until part 2 registers crawlers. */
  sourceName: string;
  /** Required of a crawler item, null of a manual one. */
  sourceUrl: string | null;
  status: LibraryItemStatus;
  createdAt: string;
  /** Rewritten on every write. The listing is ordered by it. */
  updatedAt: string;
}

export interface NovelItem extends LibraryItemBase {
  type: LibraryItemType.Novel;
  metadata: NovelMetadata;
}

export interface ImageSetItem extends LibraryItemBase {
  type: LibraryItemType.Image;
  metadata: ImageSetMetadata;
}

export interface VideoSetItem extends LibraryItemBase {
  type: LibraryItemType.Video;
  metadata: VideoSetMetadata;
}

/**
 * Discriminated on `type`, which is what makes the union worth its small cost:
 * `item.type === LibraryItemType.Video` narrows `metadata` to the one shape that
 * carries `downloadedDuration`, so a helper cannot read a field its item lacks.
 */
export type LibraryItem = NovelItem | ImageSetItem | VideoSetItem;
