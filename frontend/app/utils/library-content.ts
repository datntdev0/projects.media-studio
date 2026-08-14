import type { BadgeProps } from '@nuxt/ui'
import type { LibraryContent, LibraryContentPage, LibraryContentStatus } from '~/types/library-content'
import type { LibraryItemType } from '~/types/library'
import type { LibraryContentPageDto, NovelChapterDto } from './api.clients'

/**
 * How a piece of content reads on screen. Safe because `LibraryContent` is a
 * discriminated union: a chapter's word count and an asset's size are only
 * reachable on the types that carry one.
 */

/** A generated row, read as the union everything below narrows on — see `asLibraryItem`. */
export const asLibraryContent = (content: NovelChapterDto): LibraryContent => content as unknown as LibraryContent

/** The same, for a page of them. */
export const asLibraryContentPage = (page: LibraryContentPageDto): LibraryContentPage => page as unknown as LibraryContentPage

/** One badge per state, labelled with the state's own name. The `Record` makes a missing one a compile error. */
const CONTENT_STATUS_TAGS: Record<LibraryContentStatus, { label: string, color: BadgeProps['color'], variant: BadgeProps['variant'] }> = {
  discovered: { label: 'Discovered', color: 'neutral', variant: 'outline' },
  pending: { label: 'Pending', color: 'neutral', variant: 'subtle' },
  scraping: { label: 'Scraping', color: 'primary', variant: 'subtle' },
  completed: { label: 'Completed', color: 'primary', variant: 'subtle' },
  failed: { label: 'Failed', color: 'neutral', variant: 'outline' }
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

/**
 * How long a body runs. Whitespace-separated, which is close enough for a count
 * shown beside a chapter and is what the server is told — see the known limits.
 */
export function wordCount(text: string): number {
  const trimmed = text.trim()

  return trimmed ? trimmed.split(/\s+/).length : 0
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

/** Why every scraping control on the detail screens is disabled. */
export const SCRAPING_DEFERRED = 'Scraping arrives with the job runner.'
