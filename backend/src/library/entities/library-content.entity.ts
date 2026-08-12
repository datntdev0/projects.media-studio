import { FirestoreEntity } from '../../core/firebase/firestore.repository';
import { LibraryItemType } from './library-item.entity';

/**
 * Where one piece of content is.
 *
 * Split by ownership, as `LibraryItemStatus` is: `Pending` and `Ready` follow from
 * whether the bytes are stored, so the manager derives both from `contentUrl` and
 * no client sends either. `Failed` belongs to the job runner.
 */
export enum LibraryContentStatus {
  Pending = 'pending',
  Ready = 'ready',
  Failed = 'failed',
}

/**
 * What a piece of content carries whatever its type. It lives in the `contents`
 * subcollection of its item, so the path is the parent reference — there is no
 * `libraryItemId` field to keep in step with anything.
 */
export interface LibraryContentBase extends FirestoreEntity {
  id: string;
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
