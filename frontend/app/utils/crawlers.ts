import type { CrawlerOption, LibraryItemType } from '~/types/library'

/**
 * The crawlers the dialog can offer.
 *
 * Static, so the second step can draw the choice without asking the server for two
 * facts that fit in the bundle. `backend/src/scraping/crawlers.ts` holds the same
 * list and is the authority: validate refuses a name that is not there, so a
 * crawler missing from this copy is invisible rather than broken.
 */
export const LIBRARY_CRAWLERS: CrawlerOption[] = [
  { name: 'novel543', domain: 'www.novel543.com', kind: 'novel', healthy: true }
]

/** A crawler reads one type of item, so the list narrows with the type card. */
export const crawlersFor = (type: LibraryItemType): CrawlerOption[] => LIBRARY_CRAWLERS.filter(crawler => crawler.kind === type)
