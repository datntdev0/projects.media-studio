import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LibraryItemType, NovelStatus } from '../library/entities/library-item.entity';

/**
 * What we know about a source without asking it anything.
 *
 * `kind` and `statuses` borrow the library's own enums rather than declaring their
 * own: a crawler that could claim a type or a status the library does not have
 * would be describing an item nothing can store.
 */
export interface Crawler {
  /** What the scraping service calls it, what a request names, and what the item stores as `sourceName`. */
  name: string;
  /** What the wizard prints under the crawler's name. */
  domain: string;
  /** Every host a URL may carry. Checked before a fetch is spent. */
  hosts: string[];
  /** The one type of item it reads. It narrows the wizard's list, and it is the preview's `type`. */
  kind: LibraryItemType;
  /** What the source publishes in. novel543 never says, and every book on it is the same. */
  language: string;
  /** How the source spells its own statuses. Anything absent from this map is read as ongoing. */
  statuses: Record<string, NovelStatus>;
}

/**
 * Every crawler there is — static, and the authority. The frontend keeps a list of
 * its own so the wizard can draw the choice without a round trip, and validate
 * refuses a name that is not here.
 *
 * Adding a site is a `parser.<name>.py` in `scraping/app/` and an entry below.
 */
export const CRAWLERS: Crawler[] = [
  {
    name: 'novel543',
    domain: 'www.novel543.com',
    // The parser's own `HOSTS`, kept in step with it.
    hosts: ['novel543.com', 'www.novel543.com'],
    kind: LibraryItemType.Novel,
    language: 'zh-Hant',
    statuses: { 連載: NovelStatus.Ongoing, 完結: NovelStatus.Complete },
  },
];

/** For the sentence a request naming something else is refused with. */
export const CRAWLER_NAMES = CRAWLERS.map((crawler) => crawler.name);

export function crawlerByName(name: string): Crawler | null {
  return CRAWLERS.find((crawler) => crawler.name === name.trim()) ?? null;
}

/** The crawler named, or the 404 a name nothing answers to earns. */
export function requireCrawler(name: string): Crawler {
  const crawler = crawlerByName(name);

  if (!crawler) {
    throw new NotFoundException(`No crawler called \`${name}\`. There is: ${CRAWLER_NAMES.join(', ')}`);
  }

  return crawler;
}

/**
 * That the URL is one this crawler reads — checked before the cache and before the
 * browser, because it is the mistake the wizard exists to catch and it should cost
 * nothing to report.
 */
export function validateSourceUrl(crawler: Crawler, sourceUrl: string): void {
  const host = hostOf(sourceUrl);

  if (!host || !crawler.hosts.includes(host)) {
    throw new BadRequestException(`${crawler.name} only reads ${crawler.domain}. Pick the crawler that matches this URL.`);
  }
}

export function hostOf(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    // The DTO's `@IsUrl` has already refused anything this could catch. Belt and
    // braces, because what follows would otherwise throw a 500 over a typo.
    return null;
  }
}
