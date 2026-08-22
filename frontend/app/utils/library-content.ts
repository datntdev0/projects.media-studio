import type { BadgeProps } from '@nuxt/ui'
import type { LibraryContent, LibraryContentPage, LibraryContentStatus, ScrapeScope, ScrapeStart, TranslationLanguage } from '~/types/library-content'
import type { LibraryItemType } from '~/types/library'
import type { LibraryContentDto, LibraryContentPageDto } from './api.clients'

/**
 * How a piece of content reads on screen. The wire row carries one of four content
 * blocks and a status spelled `inprogress`; this narrows it to the flat shape
 * everything below reads, keyed on the block that is actually there rather than
 * `type`, which names the row's own kind (original, translation, …) and not the
 * item's.
 */
export function asLibraryContent(dto: LibraryContentDto): LibraryContent {
  const base = {
    id: dto.id,
    sourceUrl: dto.sourceUrl,
    status: asContentStatus(dto.status),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    translated: dto.type === 'translation',
    sourceTitle: null
  }

  if (dto.textContent) {
    return { ...base, type: 'novel', index: dto.idx, title: dto.textContent.title, language: dto.textContent.language, words: dto.textContent.words, contentUrl: dto.textContent.contentUrl }
  }

  if (dto.imageContent) {
    return { ...base, type: 'image', filename: dto.imageContent.filename, filesize: dto.imageContent.filesize, contentUrl: dto.imageContent.contentUrl }
  }

  if (dto.videoContent) {
    return { ...base, type: 'video', filename: dto.videoContent.filename, filesize: dto.videoContent.filesize, contentUrl: dto.videoContent.contentUrl }
  }

  throw new Error(`Content ${dto.id} carries no block this screen knows how to draw.`)
}

/** `inprogress` on the wire is `scraping` in the domain — the one state with two names. */
function asContentStatus(status: LibraryContentDto['status']): LibraryContentStatus {
  return status === 'inprogress' ? 'scraping' : status
}

/** The same, for a page of them. */
export const asLibraryContentPage = (page: LibraryContentPageDto): LibraryContentPage => ({
  items: page.items.map(asLibraryContent),
  nextCursor: page.nextCursor,
  pageSize: page.pageSize
})

/** One badge per state, labelled with the state's own name. The `Record` makes a missing one a compile error. */
const CONTENT_STATUS_TAGS: Record<LibraryContentStatus, { label: string, color: BadgeProps['color'], variant: BadgeProps['variant'] }> = {
  discovered: { label: 'Discovered', color: 'neutral', variant: 'outline' },
  pending: { label: 'Pending', color: 'neutral', variant: 'subtle' },
  scraping: { label: 'Scraping', color: 'primary', variant: 'subtle' },
  completed: { label: 'Completed', color: 'primary', variant: 'subtle' },
  failed: { label: 'Failed', color: 'error', variant: 'subtle' }
}

/** What one piece of content is called, per item type. */
const CONTENT_UNITS: Record<LibraryItemType, { one: string, many: string }> = {
  novel: { one: 'chapter', many: 'chapters' },
  image: { one: 'image', many: 'images' },
  video: { one: 'clip', many: 'clips' }
}

/** What each kind of item takes. The mockup's list, plus the near neighbours of each. */
const ASSET_ACCEPTS: Record<LibraryItemType, string> = {
  novel: '',
  image: 'image/jpeg,image/png,image/webp,image/avif,image/gif',
  video: 'video/mp4,video/webm,video/quicktime'
}

/** Kept in step with the cap in `storage.rules`. */
export const ASSET_MAX_MB = 200

const MAX_ASSET_BYTES = ASSET_MAX_MB * 1024 * 1024

export const contentStatusTag = (status: LibraryContentStatus) => CONTENT_STATUS_TAGS[status]

export const contentUnit = (type: LibraryItemType, count: number): string => count === 1 ? CONTENT_UNITS[type].one : CONTENT_UNITS[type].many

export const assetAccept = (type: LibraryItemType): string => ASSET_ACCEPTS[type]

/** What a row is called: a chapter by its title, an asset by its filename. */
export const contentName = (content: LibraryContent): string => content.type === 'novel' ? content.title : content.filename

/** The line under an asset's thumbnail. Its weight — the one thing we know without probing it. */
export const assetMeta = (content: LibraryContent): string => content.type === 'novel' ? '' : bytesLabel(content.filesize)

/** A chapter's length, or the dash the mockup draws where there is no text yet. */
export const wordsLabel = (words: number): string => words > 0 ? countLabel(words) : '—'

/** Every character range whose script is written without spaces, so words cannot be counted by them. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g

/**
 * How long a body runs. Whitespace-separated, and counted by character where the
 * script is written without spaces.
 *
 * The same count as `ScrapingJobManager.wordCount`, deliberately: this is the number a
 * save sends, so a helper that disagreed would rewrite the scraper's figure every time
 * a chapter was edited. Splitting a `zh` body on whitespace counts its lines.
 */
export function wordCount(text: string): number {
  const unspaced = text.match(UNSPACED_SCRIPT)?.length ?? 0
  const rest = text.replace(UNSPACED_SCRIPT, ' ').trim()

  return unspaced + (rest ? rest.split(/\s+/).length : 0)
}

/** Paragraphs as the reader draws them: blank lines collapsed, order kept. */
export const paragraphsOf = (text: string): string[] => text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)

/** Rejects with the sentence to print, as `prepareCover` does. */
export function checkAsset(file: File, type: LibraryItemType): void {
  const accepted = ASSET_ACCEPTS[type].split(',')

  if (file.type && !accepted.includes(file.type)) {
    throw new Error(`${file.name} is not a file this ${type === 'video' ? 'video set' : 'image set'} takes.`)
  }

  if (file.size > MAX_ASSET_BYTES) {
    throw new Error(`${file.name} is over the ${ASSET_MAX_MB} MB cap.`)
  }
}

/** Why the scraping controls that are still deferred are disabled. */
export const SCRAPING_DEFERRED = 'Scraping arrives with the job runner.'

/** What a novel can be read in besides its own language, in the order the mockup lists them. */
export const TRANSLATION_LANGUAGES: { code: TranslationLanguage, name: string }[] = [
  { code: 'vi', name: 'Vietnamese' },
  { code: 'en', name: 'English' },
  { code: 'zh', name: 'Chinese' }
]

/** Whether a value off the URL is a language we translate into. A hand-typed `?lang=de` reads as the source. */
export const asTranslationLanguage = (value: unknown): TranslationLanguage | undefined =>
  TRANSLATION_LANGUAGES.find(language => language.code === value)?.code

/** What a language is called on screen. The source option is named after the item's own language instead. */
export const languageName = (code: TranslationLanguage): string => TRANSLATION_LANGUAGES.find(language => language.code === code)?.name ?? code

/** What each card in the scrape dialog is called. The `Record` makes a missing one a compile error. */
export const SCRAPE_SCOPE_LABELS: Record<ScrapeScope, string> = {
  missing: 'Everything not yet extracted',
  all: 'Everything — including already extracted',
  range: 'A specific range',
  selected: 'Only the selected chapters'
}

/** On failure. The values are the retry counts the endpoint takes, not names for them. */
export const SCRAPE_RETRY_OPTIONS: { label: string, value: number }[] = [
  { label: 'Retry 3× then mark failed', value: 3 },
  { label: 'Retry once', value: 1 },
  { label: 'Do not retry', value: 0 }
]

/** When to start. `at` is a wall-clock time the caller picks. */
export const SCRAPE_START_OPTIONS: { label: string, value: ScrapeStart }[] = [
  { label: 'Queue it now', value: 'now' },
  { label: 'At a set time', value: 'at' }
]
