import type { CrawlerOption, CrawlerPreview, LibraryItemType } from '~/types/library'

/**
 * The crawler registry and the URL check behind the dialog's second step —
 * mocked, all of it.
 *
 * Part 2 registers crawlers on the server and gives them a real endpoint to
 * validate against. What the screen needs before then is the shape of that
 * exchange: a list to pick from, a call that can fail, and a metadata block to
 * review. Everything here is derived from the URL, so the same URL always reads
 * back the same item and the wizard behaves the same way twice.
 */

export const LIBRARY_CRAWLERS: CrawlerOption[] = [
  { name: 'novelbin.crawler', domain: 'novelbin.net', kind: 'novel', healthy: true },
  { name: 'wuxiaworld.crawler', domain: 'wuxiaworld.com', kind: 'novel', healthy: true },
  { name: 'pinterest.crawler', domain: 'pinterest.com', kind: 'image', healthy: false },
  { name: 'archive.crawler', domain: 'archive.org', kind: 'video', healthy: true }
]

/** A crawler reads one type of item, so the list narrows with the type card. */
export const crawlersFor = (type: LibraryItemType): CrawlerOption[] => LIBRARY_CRAWLERS.filter(crawler => crawler.kind === type)

/** Long enough that the button's spinner is seen, short enough not to be waited on. */
const VALIDATE_DELAY = 600

/** What a source of each type reports. Only a novel carries descriptive metadata. */
const MOCK_METADATA: Record<LibraryItemType, Pick<CrawlerPreview, 'unit' | 'author' | 'language' | 'genres' | 'description'> & { latest: (count: number) => string }> = {
  novel: {
    unit: 'chapters',
    latest: count => `${count} — The Last Meridian · 2 days ago`,
    author: 'Nguyen Van A',
    language: 'English',
    genres: ['fantasy', 'adventure', 'slow burn'],
    description: 'A cartographer walks a coastline that redraws itself behind them.'
  },
  image: {
    unit: 'images',
    latest: count => `Plate ${count} · 4 h ago`,
    author: '',
    language: '',
    genres: [],
    description: ''
  },
  video: {
    unit: 'clips',
    latest: count => `Reel ${count} · yesterday`,
    author: '',
    language: '',
    genres: [],
    description: ''
  }
}

/**
 * Reads the URL the way a crawler would, and hands back what it found.
 *
 * Rejects with the sentence to show: a URL off the crawler's domain is the one
 * mistake this step exists to catch.
 */
export async function validateCrawlerSource(crawler: CrawlerOption, url: string): Promise<CrawlerPreview> {
  await new Promise(resolve => setTimeout(resolve, VALIDATE_DELAY))

  const target = url.trim()

  if (!/^https?:\/\/\S+$/.test(target)) {
    throw new Error('That is not a URL yet — start it with https://')
  }

  if (!target.includes(crawler.domain)) {
    throw new Error(`${crawler.name} only reads ${crawler.domain}. Pick the crawler that matches this URL.`)
  }

  const shape = MOCK_METADATA[crawler.kind]
  const discoveredCount = pseudoCount(target, 40, 1400)

  return {
    crawler: crawler.name,
    title: titleFromUrl(target),
    coverUrl: null,
    status: 'ongoing',
    discoveredCount,
    unit: shape.unit,
    latest: shape.latest(discoveredCount),
    author: shape.author,
    language: shape.language,
    genres: [...shape.genres],
    description: shape.description
  }
}

/** The last path segment, read as a title: `/n/silent-cartographer` → `Silent Cartographer`. */
function titleFromUrl(url: string): string {
  const slug = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? ''
  const words = slug.split(/[-_]/).filter(Boolean)

  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Untitled source'
}

/** A count that looks plausible and never changes for a given URL. */
function pseudoCount(seed: string, min: number, max: number): number {
  let total = 0

  for (const char of seed) {
    total += char.charCodeAt(0)
  }

  return min + (total % (max - min + 1))
}
