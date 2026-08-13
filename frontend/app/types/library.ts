/**
 * The library API's shapes, mirrored by hand — there is no shared package yet.
 * Names and field order follow `backend/src/library/dto/` so drift is easy to spot.
 * `createdAt` is absent on purpose: the listing does not return it.
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

/**
 * One item as `GET /library/:id` answers with it. The listing deliberately omits
 * `createdAt`; a detail screen has room to say when the item was started.
 */
export type LibraryItemDetail = LibraryItem & { createdAt: string }

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
 * A crawler the dialog can offer. Static here so the wizard can draw the choice
 * without a round trip; `backend/src/scraping/crawlers.ts` is the authority, and
 * validate refuses a name it does not hold.
 */
export interface CrawlerOption {
  name: string
  domain: string
  /** The one type of item it reads, which is what filters the list. */
  kind: LibraryItemType
  healthy: boolean
}

/** What to read, and with what. The body of `POST /scraping/validate`. */
export interface ValidateSource {
  crawler: string
  sourceUrl: string
}

/** The novel as the source describes it, in our words. */
export interface CrawlerPreviewMetadata {
  /** The canonical book URL, which is what the item should store. */
  sourceUrl: string
  title: string
  author: string
  status: NovelStatus
  language: string
  genres: string[]
  description: string
  /** The newest chapter, as the source names it. */
  latest: string
  latestUrl: string
  /** When the source last changed, in the source's own format. Shown, never compared. */
  updatedAt: string
  /** Where the cover lives on the source. Behind the same protection as the site, so not for an `<img>`. */
  coverUrl: string | null
}

/** One chapter, as the source lists it. */
export interface CrawlerPreviewChapter {
  index: number
  title: string
  url: string
}

/** What a novel source holds. */
export interface NovelCrawlerPreview {
  metadata: CrawlerPreviewMetadata
  /** Every chapter. The wizard draws a count from it; the job runner will draw content. */
  chapters: CrawlerPreviewChapter[]
  /** The cover as a data URI — the bytes and their type in one string. */
  coverBinary: string | null
}

/**
 * What a crawler reports back about a URL, before anything is created.
 *
 * An envelope, as the API sends it: `type` says what kind of source was read, and
 * a crawler that reads image sets will add a `content` shape rather than reshape
 * this one.
 */
export interface CrawlerPreview {
  type: LibraryItemType
  content: NovelCrawlerPreview
}
