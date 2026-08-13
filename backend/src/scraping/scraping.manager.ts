import { BadRequestException, Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';
import { CacheProvider, CacheType } from '../core/providers/cache.provider';
import { ScrapedChapter, ScrapedCover, ScrapedNovel, ScrapingProvider } from '../core/providers/scraping.provider';
import { LibraryItemType, NovelStatus } from '../library/entities/library-item.entity';
import { Crawler, CRAWLER_NAMES, crawlerByName } from './crawlers';
import { NovelPreviewDto, PreviewDto } from './dto/preview.dto';
import { ValidateDto } from './dto/validate.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reading a source, and what a reading means.
 *
 * The order matters and is the whole design: refuse what can be refused for free,
 * answer from the cache if it can, and only then spend twenty seconds of somebody
 * else's browser. What is built is what is stored, so a hit and a miss cannot
 * return different things.
 *
 * Framework-free apart from `@Injectable()` and the exceptions — no request, no
 * response — so its spec needs no Nest fixture.
 */
@Injectable()
export class ScrapingManager {
  private readonly logger = new Logger(ScrapingManager.name);

  constructor(
    private readonly scraping: ScrapingProvider,
    private readonly cache: CacheProvider,
    private readonly config: AppConfigService,
  ) {}

  async validate(input: ValidateDto, refresh = false): Promise<PreviewDto> {
    const crawler = requireCrawler(input.crawler);

    checkHost(crawler, input.sourceUrl);

    // A novel is the only content a crawler reads today. A registry entry of
    // another kind would need a `content` shape of its own, and answering with
    // this one would be a lie rather than an omission.
    if (crawler.kind !== LibraryItemType.Novel) {
      throw new NotImplementedException(`${crawler.name} reads ${crawler.kind} sets, and there is nothing here yet that can describe one`);
    }

    const bookId = bookIdFrom(input.sourceUrl);
    const key = cacheKeyFor(crawler, bookId);

    if (!refresh) {
      const cached = await this.cache.get<PreviewDto>(key, CacheType.Scraping);

      if (cached) {
        return cached;
      }
    }

    const preview = await this.read(crawler, input.sourceUrl, bookId);

    await this.cache.set(key, CacheType.Scraping, preview, this.config.scraping.cacheTtlDays * DAY_MS);

    return preview;
  }

  /**
   * The three calls, in order, one at a time.
   *
   * Sequential because the service drives a single browser: three at once would
   * save seconds one time and complicate every failure. The cover is allowed to
   * fail — a book without one is still a book — while the other two are not.
   */
  private async read(crawler: Crawler, sourceUrl: string, bookId: string): Promise<PreviewDto> {
    const novel = await this.scraping.metadata(crawler.name, sourceUrl);

    // The key was built from the URL before anything was read, and only a URL is
    // ever available to look one up with. If the source files the book under
    // something else, the key is still the honest one to use — but the two
    // disagreeing is worth hearing about rather than discovering as a cache that
    // never hits.
    if (novel.id !== bookId) {
      this.logger.warn(`${crawler.name} answered for book \`${novel.id}\` under a URL that reads as \`${bookId}\` — the cache is keyed on the URL.`);
    }

    const chapters = await this.scraping.chapters(crawler.name, sourceUrl);
    const cover = await this.scraping.cover(crawler.name, sourceUrl);

    return { type: crawler.kind, content: novelContent(crawler, novel, chapters, cover) };
  }
}

/** The crawler named, or the 404 a name nothing answers to earns. */
function requireCrawler(name: string): Crawler {
  const crawler = crawlerByName(name);

  if (!crawler) {
    throw new NotFoundException(`No crawler called \`${name}\`. There is: ${CRAWLER_NAMES.join(', ')}`);
  }

  return crawler;
}

/**
 * That the URL is one this crawler reads — checked here, before the cache and
 * before the browser, because it is the mistake this whole screen exists to catch
 * and it should cost nothing to report.
 */
function checkHost(crawler: Crawler, sourceUrl: string): void {
  const host = hostOf(sourceUrl);

  if (!host || !crawler.hosts.includes(host)) {
    throw new BadRequestException(`${crawler.name} only reads ${crawler.domain}. Pick the crawler that matches this URL.`);
  }
}

function hostOf(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    // The DTO's `@IsUrl` has already refused anything this could catch. Belt and
    // braces, because what follows would otherwise throw a 500 over a typo.
    return null;
  }
}

/**
 * The book id, as the URL gives it: the first path segment. What
 * `parser.novel543.py`'s `resolve()` reads, and what makes
 * `/0413553971`, `/0413553971/` and `/0413553971/dir` one cache entry.
 *
 * A site that keys a book differently will need this on the crawler entry rather
 * than here. Empty is legal and simply keys the site's own front page.
 */
function bookIdFrom(sourceUrl: string): string {
  const path = hostOf(sourceUrl) ? new URL(sourceUrl).pathname : '';

  return path.split('/').filter(Boolean)[0] ?? '';
}

/** `novel:validate:novel543:0413553971` — kind, what was asked, crawler, book. */
function cacheKeyFor(crawler: Crawler, bookId: string): string {
  return `${crawler.kind}:validate:${crawler.name}:${bookId}`;
}

/** The source's words, in ours. Every absent field lands on a value the DTO promises. */
function novelContent(crawler: Crawler, novel: ScrapedNovel, chapters: ScrapedChapter[], cover: ScrapedCover | null): NovelPreviewDto {
  return {
    metadata: {
      sourceUrl: novel.url,
      title: novel.title ?? '',
      author: novel.author ?? '',
      status: crawler.statuses[novel.status ?? ''] ?? NovelStatus.Ongoing,
      language: crawler.language,
      genres: novel.category ? [novel.category] : [],
      description: novel.description ?? '',
      latest: novel.latestChapter ?? '',
      latestUrl: novel.latestChapterUrl ?? '',
      updatedAt: novel.updatedAt ?? '',
      coverUrl: novel.coverUrl ?? null,
    },
    // Field by field rather than a spread, so a field the service adds cannot
    // arrive in our response without anyone deciding it should.
    chapters: chapters.map((chapter) => ({ index: chapter.index, title: chapter.title, url: chapter.url })),
    coverBinary: cover ? `data:${cover.contentType};base64,${cover.bytes.toString('base64')}` : null,
  };
}
