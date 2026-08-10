/**
 * The library API's shapes, mirrored by hand.
 *
 * There is no package shared between the two workspaces yet, and `profile.vue`
 * already sets the precedent of declaring a response shape client-side. Names and
 * field order follow `backend/src/library/dto/` so a drift is easy to spot.
 *
 * `createdAt` is absent on purpose: the listing does not return it — see
 * `LibraryListItemDto` — and no screen in part 1 draws it.
 */

/** What the item holds, and therefore what shape its `metadata` has. */
export type LibraryItemType = 'novel' | 'image' | 'video'

/** Where its content comes from: a person, or a crawler reading a URL. */
export type LibrarySourceMode = 'manual' | 'crawler'

/** Where the item is in our pipeline. */
export type LibraryItemStatus = 'draft' | 'scraping' | 'ready' | 'failed'

/** The two a person owns. `scraping` and `failed` are the job runner's. */
export type WritableLibraryItemStatus = Extract<LibraryItemStatus, 'draft' | 'ready'>

/** The work's own status, as its source publishes it — never ours. */
export type NovelStatus = 'ongoing' | 'complete' | 'hiatus'

/** What every type of item knows about its content. All server-owned. */
export interface LibraryItemMetadataBase {
  discoveredCount: number
  discoveredAt: string | null
  downloadedCount: number
}

export interface NovelMetadata extends LibraryItemMetadataBase {
  status: NovelStatus
  author: string
  language: string
  genres: string[]
  description: string
}

export interface ImageSetMetadata extends LibraryItemMetadataBase {
  /** Bytes held. */
  downloadedSize: number
}

export interface VideoSetMetadata extends LibraryItemMetadataBase {
  /** Bytes held. */
  downloadedSize: number
  /** Seconds held. */
  downloadedDuration: number
}

/** What a row carries whatever its type. */
interface LibraryItemBase {
  id: string
  title: string
  coverUrl: string | null
  sourceMode: LibrarySourceMode
  sourceName: string
  sourceUrl: string | null
  status: LibraryItemStatus
  updatedAt: string
}

export interface NovelItem extends LibraryItemBase {
  type: 'novel'
  metadata: NovelMetadata
}

export interface ImageSetItem extends LibraryItemBase {
  type: 'image'
  metadata: ImageSetMetadata
}

export interface VideoSetItem extends LibraryItemBase {
  type: 'video'
  metadata: VideoSetMetadata
}

/**
 * Discriminated on `type`, as the entity is: `item.type === 'video'` narrows
 * `metadata` to the one shape carrying `downloadedDuration`, so a presentation
 * helper cannot read a field its item does not have.
 */
export type LibraryItem = NovelItem | ImageSetItem | VideoSetItem

/** One page of the listing, and enough to draw the counts and the pager around it. */
export interface LibraryItemPage {
  items: LibraryItem[]
  total: number
  page: number
  pageSize: number
}

/** The writable half of `metadata`: a novel's descriptive block, and nothing else. */
export interface LibraryItemMetadataInput {
  status?: NovelStatus
  author?: string
  language?: string
  genres?: string[]
  description?: string
}

export interface CreateLibraryItem {
  type: LibraryItemType
  title: string
  coverUrl?: string | null
  sourceMode: LibrarySourceMode
  sourceName?: string
  sourceUrl?: string | null
  metadata?: LibraryItemMetadataInput
}

/**
 * The `PUT` body — the item's whole writable representation, which is why an
 * omitted field is a cleared field rather than an untouched one.
 */
export interface ReplaceLibraryItem extends CreateLibraryItem {
  status?: WritableLibraryItemStatus
}

export interface ListLibraryItemsQuery {
  type?: LibraryItemType
  status?: LibraryItemStatus
  sourceMode?: LibrarySourceMode
  search?: string
  page?: number
  pageSize?: number
}

/**
 * The filter as the screen holds it. `all` is the screen's word for "do not
 * narrow on this", and never reaches the request — the query drops the key
 * instead.
 */
export interface LibraryFilters {
  type: LibraryItemType | 'all'
  status: LibraryItemStatus | 'all'
  sourceMode: LibrarySourceMode | 'all'
  search: string
  page: number
}

/** Which of the two views the listing is drawn in. */
export type LibraryView = 'table' | 'grid'

/** One option of a filter control: what it is called, and what it narrows to. */
export interface LibraryFilterOption<Value> {
  label: string
  value: Value
}

/** One of the dialog's blueprint radio cards: a choice with a line explaining it. */
export interface LibraryChoice<Value> extends LibraryFilterOption<Value> {
  hint: string
  icon: string
}

/**
 * A crawler the dialog can offer. Part 2 registers these on the server; until
 * then `utils/crawlers.ts` holds a mocked list.
 */
export interface CrawlerOption {
  name: string
  domain: string
  /** The one type of item it reads, which is what filters the list. */
  kind: LibraryItemType
  healthy: boolean
}

/** What a crawler reports back about a URL, before anything is created. */
export interface CrawlerPreview {
  crawler: string
  title: string
  coverUrl: string | null
  author: string
  language: string
  status: NovelStatus
  genres: string[]
  description: string
  /** How many pieces of content the source holds, and what they are called. */
  discoveredCount: number
  unit: string
  /** The newest piece, as the source names it. */
  latest: string
}
