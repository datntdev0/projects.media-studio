/**
 * What a library item holds, mirrored by hand — there is no shared package yet.
 * Names and field order follow `backend/src/library/dto/` so drift is easy to spot.
 */

import type { LibraryItemType } from '~/types/library'

/** Where one piece of content is. `failed` is the job runner's; the other two follow from `contentUrl`. */
export type LibraryContentStatus = 'pending' | 'ready' | 'failed'

/** What a row carries whatever its type. */
interface LibraryContentBase {
  id: string
  /** Where the bytes are. Null while the row is a placeholder. */
  contentUrl: string | null
  status: LibraryContentStatus
  createdAt: string
  updatedAt: string
}

export interface NovelChapter extends LibraryContentBase {
  type: 'novel'
  /** The chapter number, and what the list is ordered by. */
  index: number
  title: string
  language: string
  words: number
}

export interface ImageAsset extends LibraryContentBase {
  type: 'image'
  filename: string
  /** Bytes. */
  filesize: number
}

export interface VideoAsset extends LibraryContentBase {
  type: 'video'
  filename: string
  /** Bytes. */
  filesize: number
}

/**
 * Discriminated on `type`, which is the parent item's — so `content.type === 'novel'`
 * narrows to the one shape carrying `index` and `words`, and a presentation helper
 * cannot read a field its row does not have.
 */
export type LibraryContent = NovelChapter | ImageAsset | VideoAsset

/** One page of an item's content, and enough to draw the counts around it. */
export interface LibraryContentPage {
  items: LibraryContent[]
  total: number
  page: number
  pageSize: number
}

/**
 * The write body. One shape for all three types, as the API takes it: which fields
 * are required and which are refused follows from the item's type, and the server
 * is what says so.
 */
export interface CreateLibraryContent {
  index?: number
  title?: string
  language?: string
  words?: number
  filename?: string
  filesize?: number
  contentUrl?: string | null
}

export interface ListLibraryContentsQuery {
  status?: LibraryContentStatus
  search?: string
  page?: number
  pageSize?: number
}

/** Which asset a screen is acting on, and what it is called there. */
export type LibraryAsset = ImageAsset | VideoAsset

/** What every content type is called on screen, per item type. */
export type LibraryContentUnit = Record<LibraryItemType, string>
