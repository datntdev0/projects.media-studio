import type { NovelStatus } from './library-item.entity';

/**
 * What every type of item knows about its content: how much of it there is, when
 * that was last established, and how much of it we hold.
 *
 * All server-owned. Part 1 has no crawler, so a client cannot set these — one
 * that could would be claiming content that does not exist.
 */
export interface LibraryItemMetadataBase {
  /** Pieces the source is known to have — chapters, images, clips. */
  discoveredCount: number;
  /** When the source was last read for that inventory. Null until it has been. */
  discoveredAt: string | null;
  /** How many of them are stored here. */
  downloadedCount: number;
}

/** A novel, and what the source says about the work itself. */
export interface NovelMetadata extends LibraryItemMetadataBase {
  /** The work's own status, as its source publishes it. */
  status: NovelStatus;
  author: string;
  language: string;
  genres: string[];
  description: string;
}

/** A set of images. */
export interface ImageSetMetadata extends LibraryItemMetadataBase {
  /** Bytes held. */
  downloadedSize: number;
}

/** A set of videos: bytes, and how long they run. */
export interface VideoSetMetadata extends LibraryItemMetadataBase {
  /** Bytes held. */
  downloadedSize: number;
  /** Seconds held. */
  downloadedDuration: number;
}

/** Discriminated by the item's `type`, never on its own. */
export type LibraryItemMetadata = NovelMetadata | ImageSetMetadata | VideoSetMetadata;
