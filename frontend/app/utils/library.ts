import type { BadgeProps } from '@nuxt/ui'
import type { LibraryChoice, LibraryFilterOption, LibraryFilters, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, LibraryView, NovelStatus, WritableLibraryItemStatus } from '~/types/library'

/**
 * How a library item reads on screen — the labels, the tags and the one-line
 * summaries both views share.
 *
 * Auto-imported by Nuxt, and safe because `LibraryItem` is a discriminated union:
 * a size or a run time is only reachable on the types that carry one.
 */

/** What a piece of content is called, per type. */
const CONTENT_UNITS: Record<LibraryItemType, string> = {
  novel: 'ch.',
  image: 'images',
  video: 'clips'
}

const TYPE_LABELS: Record<LibraryItemType, string> = {
  novel: 'Novel',
  image: 'Image',
  video: 'Video'
}

/**
 * The status tag. A mono scheme, so the four are told apart by weight rather than
 * by colour — `--color-danger` is for destructive actions and nothing else, which
 * is why a failed item is an outline and not a red tag.
 */
const STATUS_TAGS: Record<LibraryItemStatus, { label: string, color: BadgeProps['color'], variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', color: 'neutral', variant: 'subtle' },
  scraping: { label: 'Scraping', color: 'primary', variant: 'solid' },
  ready: { label: 'Ready', color: 'primary', variant: 'subtle' },
  failed: { label: 'Failed', color: 'neutral', variant: 'outline' }
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

const MINUTE = 60_000

const HOUR = 60 * MINUTE

const DAY = 24 * HOUR

/** Past this, a relative age says less than the date does. */
const RELATIVE_DAYS = 30

export const typeLabel = (type: LibraryItemType): string => TYPE_LABELS[type]

export const statusTag = (status: LibraryItemStatus) => STATUS_TAGS[status]

/**
 * `412 / 640 ch.`, `248 images`, `42 clips · 3.1 GB` — what is held, of what the
 * source is known to have. The two counts collapse to one where nothing is
 * outstanding, so a finished item does not read as a fraction of itself.
 */
export function contentLabel(item: LibraryItem): string {
  const { discoveredCount, downloadedCount } = item.metadata
  const held = discoveredCount > downloadedCount
    ? `${countLabel(downloadedCount)} / ${countLabel(discoveredCount)}`
    : countLabel(downloadedCount)

  const parts = [`${held} ${CONTENT_UNITS[item.type]}`]

  // Only a video set states its size, as the mockup draws it: a clip's weight is
  // what a reader wants to know before playing one.
  if (item.type === 'video' && item.metadata.downloadedSize > 0) {
    parts.push(bytesLabel(item.metadata.downloadedSize))
  }

  return parts.join(' · ')
}

/**
 * The line under the title. A novel is described by its author and genres; an
 * image or video set has no descriptive metadata in part 1, so it has no line
 * rather than a made-up one.
 */
export function itemSummary(item: LibraryItem): string {
  if (item.type !== 'novel') {
    return ''
  }

  const byline = [item.metadata.author, item.metadata.genres.join(', ')].filter(Boolean).join(' · ')

  return byline || item.metadata.description
}

/** Thousands separated, so `1,204 ch.` reads at a glance. */
export const countLabel = (count: number): string => count.toLocaleString()

/** Bytes at the largest unit that keeps the number small. */
export function bytesLabel(bytes: number): string {
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${BYTE_UNITS[unit]}`
}

/** How long ago the item last changed, in the coarsest unit that still says it. */
export function relativeUpdated(updatedAt: string): string {
  const elapsed = Date.now() - new Date(updatedAt).getTime()

  if (elapsed < MINUTE) {
    return 'Just now'
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`
  }

  const days = Math.floor(elapsed / DAY)

  if (days === 1) {
    return 'Yesterday'
  }

  if (days < RELATIVE_DAYS) {
    return `${days} days ago`
  }

  return new Date(updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/** The URL without its scheme, which every row would otherwise repeat. */
export const displayUrl = (url: string | null): string => url ? url.replace(/^https?:\/\//, '') : '—'

/** The type tabs, `All` first — the same order the sidebar and the mockup use. */
export const LIBRARY_TYPE_TABS: LibraryFilterOption<LibraryFilters['type']>[] = [
  { label: 'All', value: 'all' },
  { label: 'Novels', value: 'novel' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]

/** All four statuses: a filter reads data it does not write. */
export const LIBRARY_STATUS_FILTERS: LibraryFilterOption<LibraryFilters['status']>[] = [
  { label: 'Any status', value: 'all' },
  { label: 'Ready', value: 'ready' },
  { label: 'Scraping', value: 'scraping' },
  { label: 'Draft', value: 'draft' },
  { label: 'Failed', value: 'failed' }
]

export const LIBRARY_SOURCE_FILTERS: LibraryFilterOption<LibraryFilters['sourceMode']>[] = [
  { label: 'Any source', value: 'all' },
  { label: 'Manual', value: 'manual' },
  { label: 'Crawler', value: 'crawler' }
]

export const LIBRARY_VIEWS: { value: LibraryView, label: string, icon: string }[] = [
  { value: 'table', label: 'Table view', icon: 'i-lucide-menu' },
  { value: 'grid', label: 'Grid view', icon: 'i-lucide-layout-grid' }
]

/** The dialog's type cards. Immutable after creation, which is why they are a choice made once. */
export const LIBRARY_TYPE_CHOICES: LibraryChoice<LibraryItemType>[] = [
  { value: 'novel', label: 'Novel', hint: 'Text, chapter by chapter', icon: 'i-lucide-book-open' },
  { value: 'image', label: 'Image set', hint: 'Many images in one item', icon: 'i-lucide-image' },
  { value: 'video', label: 'Video set', hint: 'Many clips in one item', icon: 'i-lucide-video' }
]

/** The dialog's source cards. Part 1 registers no crawlers, so the name is typed in. */
export const LIBRARY_SOURCE_CHOICES: LibraryChoice<LibrarySourceMode>[] = [
  { value: 'crawler', label: 'From a crawler', hint: 'Name the crawler and paste the URL it reads.', icon: 'i-lucide-globe' },
  { value: 'manual', label: 'Manually', hint: 'Enter the metadata yourself, then add content later.', icon: 'i-lucide-pencil' }
]

/** The work's own status — a novel's, and only a novel's. */
export const NOVEL_STATUS_OPTIONS: LibraryFilterOption<NovelStatus>[] = [
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Complete', value: 'complete' },
  { label: 'Hiatus', value: 'hiatus' }
]

/** The pipeline statuses a person may set. The other two are the job runner's. */
export const WRITABLE_STATUS_OPTIONS: LibraryFilterOption<WritableLibraryItemStatus>[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Ready', value: 'ready' }
]
