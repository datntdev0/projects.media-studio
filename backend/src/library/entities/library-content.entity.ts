import { FirestoreEntity } from '../../core/firebase/firestore.repository';
import { LibraryItemType } from './library-item.entity';

/**
 * How far one piece of content has got — a life cycle rather than a derivation.
 *
 * `Discovered` is what the source turned out to hold and nothing more; `Pending` is
 * queued, or a placeholder added by hand; `Scraping` is in flight; `Completed` means
 * the bytes are stored. `Scraping` and `Failed` belong to the job runner, and the
 * manager still derives `Pending` and `Completed` from `contentUrl`.
 */
export enum LibraryContentStatus {
  Discovered = 'discovered',
  Pending = 'pending',
  Scraping = 'scraping',
  Completed = 'completed',
  Failed = 'failed',
}

/**
 * What a piece of content carries whatever its type. It lives in the `contents`
 * subcollection of its item, so the path is the parent reference — there is no
 * `libraryItemId` field to keep in step with anything.
 */
export interface LibraryContentBase extends FirestoreEntity {
  id: string;
  /** Where the piece came from. Null for a row added by hand, and what discovery matches on. */
  sourceUrl: string | null;
  /** Where the bytes are. Null while the row is a placeholder — a chapter added by title alone. */
  contentUrl: string | null;
  status: LibraryContentStatus;
  createdAt: string;
  /** Rewritten on every write. */
  updatedAt: string;
}

/** One chapter of a novel. */
export interface NovelChapter extends LibraryContentBase {
  type: LibraryItemType.Novel;
  /** The chapter number, and what the list is ordered by. */
  index: number;
  title: string;
  language: string;
  /** How long the stored text runs. Zero until there is text. */
  words: number;
}

/** One image of a set. */
export interface ImageAsset extends LibraryContentBase {
  type: LibraryItemType.Image;
  filename: string;
  /** Bytes. */
  filesize: number;
}

/** One clip of a set. */
export interface VideoAsset extends LibraryContentBase {
  type: LibraryItemType.Video;
  filename: string;
  /** Bytes. */
  filesize: number;
}

/**
 * Discriminated on `type`, which is the item's own — so a row cannot claim a type
 * its parent is not, and `content.type === 'novel'` narrows to the one shape that
 * carries `index` and `words`.
 *
 * The two asset shapes are identical and stay two, for the reason the two set
 * metadata cases in `LibraryManager` stay two: each narrows off its own `type`,
 * and merged, neither would.
 */
export type LibraryContent = NovelChapter | ImageAsset | VideoAsset;
