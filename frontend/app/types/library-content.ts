/**
 * What a library item holds, mirrored by hand — there is no shared package yet.
 * Names and field order follow `backend/src/library/dto/` so drift is easy to spot.
 */

import type { LibraryItemType } from '~/types/library'

/** How far one piece of content has got. `pending` and `completed` follow from `contentUrl`; the rest are discovery's and the job runner's. */
export type LibraryContentStatus = 'discovered' | 'pending' | 'scraping' | 'completed' | 'failed'

/** The languages a novel can be read in besides its own. */
export type TranslationLanguage = 'vi' | 'en' | 'zh'

/** How much of a novel one language covers, as the item reports it. */
export interface TranslationCoverage {
  language: TranslationLanguage
  translated: number
}

/** What a row carries whatever its type. */
interface LibraryContentBase {
  id: string
  /** Where the piece came from. Null for a row added by hand. */
  sourceUrl: string | null
  /** Where the bytes are. Null while the row is a placeholder. */
  contentUrl: string | null
  status: LibraryContentStatus
  createdAt: string
  updatedAt: string
  /** Whether this row is a translation. False for the source, and false for a chapter nothing has translated yet. */
  translated: boolean
  /** What the chapter is called in its own language, for the line under a translated title. Null when this row is the source. */
  sourceTitle: string | null
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
  sourceUrl?: string | null
  contentUrl?: string | null
}

export interface ListLibraryContentsQuery {
  status?: LibraryContentStatus
  search?: string
  page?: number
  pageSize?: number
  /** Left out means the source, which is what every content route did before translations. */
  language?: TranslationLanguage
}

/** Which asset a screen is acting on, and what it is called there. */
export type LibraryAsset = ImageAsset | VideoAsset

/** What every content type is called on screen, per item type. */
export type LibraryContentUnit = Record<LibraryItemType, string>

/** Which rows a scraping job takes. The dialog's four cards, and what `range` is built from. */
export type ScrapeScope = 'missing' | 'all' | 'range' | 'selected'

/** When the work is published. `at` is the only one that carries a time. */
export type ScrapeStart = 'now' | 'at'
