// The manager reaches `CacheProvider`, and that file reaches the Admin SDK — where
// `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot require.
// Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';
import { CacheProvider, CacheType } from '../core/providers/cache.provider';
import { ScrapedChapter, ScrapedCover, ScrapedNovel, ScrapingProvider } from '../core/providers/scraping.provider';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from '../library/entities/library-item.entity';
import { DiscoveredContent, LibraryContentManager } from '../library/library-content.manager';
import { LibraryItemManager } from '../library/library-item.manager';
import { PreviewDto } from './dto/preview.dto';
import { ScrapingManager } from './scraping.manager';

const CRAWLER = 'novel543';

const SOURCE_URL = 'https://www.novel543.com/0413553971';

const KEY = 'novel:validate:novel543:0413553971';

const TTL_DAYS = 30;

const NOVEL: ScrapedNovel = {
  id: '0413553971',
  url: SOURCE_URL,
  crawler: CRAWLER,
  title: '我只是一個凡人，為什麼你們都奉我為聖',
  author: '金屬寒霜',
  category: '武俠',
  status: '連載',
  updatedAt: '2026-08-13 00:33:11',
  latestChapter: '第1305章：力量的誘惑',
  latestChapterUrl: 'https://www.novel543.com/0413553971/1305.html',
  coverUrl: 'https://i2.novel543.com/thumb_qm/120x160/20231221/211245397160.jpg',
};

const CHAPTERS: ScrapedChapter[] = [
  { index: 1, title: '第1章：雨中少女', url: 'https://www.novel543.com/0413553971/8095_1.html' },
  { index: 2, title: '第2章：山雨欲來', url: 'https://www.novel543.com/0413553971/8095_2.html' },
];

const COVER: ScrapedCover = { contentType: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };

/**
 * An entry already in the cache, deliberately unlike what the provider would
 * answer: a hit that returned the fresh reading would pass either way.
 */
const HELD: PreviewDto = {
  type: LibraryItemType.Novel,
  content: {
    metadata: {
      sourceUrl: SOURCE_URL,
      title: 'Read three weeks ago',
      author: '金屬寒霜',
      status: NovelStatus.Complete,
      language: 'zh',
      genres: [],
      description: '',
      latest: '',
      latestUrl: '',
      updatedAt: '2026-07-20 00:00:00',
      coverUrl: null,
    },
    chapters: [],
    coverBinary: null,
  },
};

/** The three calls, recorded in the order they were made. */
class FakeScrapingProvider {
  readonly calls: string[] = [];

  novel: ScrapedNovel = NOVEL;

  chapterList: ScrapedChapter[] = CHAPTERS;

  coverImage: ScrapedCover | null = COVER;

  /** Set to make the cover fail the way a missing one does not. */
  coverThrows: Error | null = null;

  metadata(crawler: string, sourceUrl: string): Promise<ScrapedNovel> {
    this.calls.push(`metadata ${crawler} ${sourceUrl}`);

    return Promise.resolve(this.novel);
  }

  chapters(crawler: string): Promise<ScrapedChapter[]> {
    this.calls.push(`chapters ${crawler}`);

    return Promise.resolve(this.chapterList);
  }

  cover(crawler: string): Promise<ScrapedCover | null> {
    this.calls.push(`cover ${crawler}`);

    return this.coverThrows ? Promise.reject(this.coverThrows) : Promise.resolve(this.coverImage);
  }
}

/** What the manager needs of the cache: a read, a write, and what each was given. */
class FakeCache {
  readonly entries = new Map<string, unknown>();

  readonly reads: string[] = [];

  readonly writes: { key: string; ttlMs: number }[] = [];

  get<T>(cacheKey: string, cacheType: CacheType): Promise<T | null> {
    expect(cacheType).toBe(CacheType.Scraping);
    this.reads.push(cacheKey);

    return Promise.resolve((this.entries.get(cacheKey) as T | undefined) ?? null);
  }

  set<T>(cacheKey: string, cacheType: CacheType, value: T, ttlMs: number): Promise<void> {
    expect(cacheType).toBe(CacheType.Scraping);
    this.writes.push({ key: cacheKey, ttlMs });
    this.entries.set(cacheKey, value);

    return Promise.resolve();
  }
}

/** What discovery needs of the catalogue: the lookup, and the 404 it owes. */
class FakeLibraryManager {
  constructor(public items: LibraryItem[] = []) {}

  get(id: string): Promise<LibraryItem> {
    const item = this.items.find((candidate) => candidate.id === id);

    if (!item) {
      return Promise.reject(new NotFoundException(`No library item ${id}`));
    }

    return Promise.resolve(item);
  }
}

/** What it needs of the subcollection: what it was handed, and how much of it was new. */
class FakeContentManager {
  readonly appended: { itemId: string, found: DiscoveredContent[] }[] = [];

  fresh = 0;

  appendDiscovered(itemId: string, found: DiscoveredContent[]): Promise<number> {
    this.appended.push({ itemId, found });

    return Promise.resolve(this.fresh);
  }
}

function novel(over: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: '我只是一個凡人，為什麼你們都奉我為聖',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: CRAWLER,
    sourceUrl: SOURCE_URL,
    status: LibraryItemStatus.Draft,
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '金屬寒霜', language: 'Chinese', genres: [], description: '' },
    createdAt: '2026-08-11T09:12:04.113Z',
    updatedAt: '2026-08-11T09:12:04.113Z',
    ...over,
  };
}

function fixture(items: LibraryItem[] = [novel()]) {
  const scraping = new FakeScrapingProvider();
  const cache = new FakeCache();
  const config = { scraping: { baseUrl: '', timeoutMs: 1, cacheTtlDays: TTL_DAYS } } as AppConfigService;
  const library = new FakeLibraryManager(items);
  const contents = new FakeContentManager();

  const manager = new ScrapingManager(
    scraping as unknown as ScrapingProvider,
    cache as unknown as CacheProvider,
    config,
    library as unknown as LibraryItemManager,
    contents as unknown as LibraryContentManager,
  );

  return { scraping, cache, library, contents, manager };
}

describe('ScrapingManager.validate', () => {
  it('reads the source and describes it in our words', async () => {
    const { manager } = fixture();

    const preview = await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL });

    expect(preview).toEqual({
      type: 'novel',
      content: {
        metadata: {
          sourceUrl: SOURCE_URL,
          title: NOVEL.title,
          author: NOVEL.author,
          status: NovelStatus.Ongoing,
          language: 'Chinese',
          genres: ['武俠'],
          description: '',
          latest: NOVEL.latestChapter,
          latestUrl: NOVEL.latestChapterUrl,
          updatedAt: NOVEL.updatedAt,
          coverUrl: NOVEL.coverUrl,
        },
        chapters: CHAPTERS,
        coverBinary: 'data:image/jpeg;base64,/9j/4A==',
      },
    });
  });

  it('asks for metadata, chapters and cover, in that order', async () => {
    const { scraping, manager } = fixture();

    await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL });

    expect(scraping.calls).toEqual([`metadata ${CRAWLER} ${SOURCE_URL}`, `chapters ${CRAWLER}`, `cover ${CRAWLER}`]);
  });

  it('caches exactly what it answered, under the book it read', async () => {
    const { cache, manager } = fixture();

    const preview = await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL });

    expect(cache.writes).toEqual([{ key: KEY, ttlMs: TTL_DAYS * 24 * 60 * 60 * 1000 }]);
    expect(cache.entries.get(KEY)).toEqual(preview);
  });

  it('answers a second time from the cache, without reading the source', async () => {
    const { scraping, cache, manager } = fixture();

    cache.entries.set(KEY, HELD);

    await expect(manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL })).resolves.toEqual(HELD);
    expect(scraping.calls).toEqual([]);
    expect(cache.writes).toEqual([]);
  });

  it('reads the source again when told to refresh, without reading the cache', async () => {
    const { scraping, cache, manager } = fixture();

    cache.entries.set(KEY, { type: 'novel' });

    await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL }, true);

    expect(cache.reads).toEqual([]);
    expect(scraping.calls).toHaveLength(3);
    expect(cache.writes).toHaveLength(1);
  });

  it('keys the same book under one entry, whatever the URL spelling', async () => {
    const { cache, manager } = fixture();

    await manager.validate({ crawler: CRAWLER, sourceUrl: 'https://novel543.com/0413553971/dir' });

    expect(cache.writes[0]?.key).toBe(KEY);
  });

  it('refuses a name no crawler answers to, before anything is read', async () => {
    const { scraping, cache, manager } = fixture();

    await expect(manager.validate({ crawler: 'wuxiaworld', sourceUrl: SOURCE_URL })).rejects.toThrow(NotFoundException);
    expect(scraping.calls).toEqual([]);
    expect(cache.reads).toEqual([]);
  });

  it("refuses a URL on someone else's site, before anything is read", async () => {
    const { scraping, cache, manager } = fixture();

    await expect(manager.validate({ crawler: CRAWLER, sourceUrl: 'https://www.wuxiaworld.com/novel/whatever' })).rejects.toThrow(
      new BadRequestException('novel543 only reads www.novel543.com. Pick the crawler that matches this URL.'),
    );
    expect(scraping.calls).toEqual([]);
    expect(cache.reads).toEqual([]);
  });

  it('maps the source\'s own word for its status, and reads an unknown one as ongoing', async () => {
    for (const [published, expected] of [
      ['連載', NovelStatus.Ongoing],
      ['完結', NovelStatus.Complete],
      ['絕版', NovelStatus.Ongoing],
      [undefined, NovelStatus.Ongoing],
    ] as const) {
      const { scraping, manager } = fixture();

      scraping.novel = { ...NOVEL, status: published };

      const preview = await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL });

      expect(preview.content.metadata.status).toBe(expected);
    }
  });

  it('fills what a sparse book leaves out, rather than passing undefined on', async () => {
    const { scraping, manager } = fixture();

    scraping.novel = { id: '0413553971', url: SOURCE_URL, crawler: CRAWLER };
    scraping.chapterList = [];
    scraping.coverImage = null;

    const { metadata, chapters, coverBinary } = (await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL })).content;

    expect(metadata).toMatchObject({ title: '', author: '', description: '', latest: '', latestUrl: '', updatedAt: '', genres: [], coverUrl: null });
    expect(chapters).toEqual([]);
    expect(coverBinary).toBeNull();
  });

  it('caches a book with no cover — that is a fact about the book, not a failure', async () => {
    const { scraping, cache, manager } = fixture();

    scraping.coverImage = null;

    const preview = await manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL });

    expect(preview.content.coverBinary).toBeNull();
    expect(cache.writes).toEqual([{ key: KEY, ttlMs: TTL_DAYS * 24 * 60 * 60 * 1000 }]);
    expect(cache.entries.get(KEY)).toEqual(preview);
  });

  it('lets a cover failure that is not a missing cover through, and caches nothing', async () => {
    const { scraping, cache, manager } = fixture();

    scraping.coverThrows = new Error('The cover URL did not return an image');

    await expect(manager.validate({ crawler: CRAWLER, sourceUrl: SOURCE_URL })).rejects.toThrow('The cover URL did not return an image');
    expect(cache.writes).toEqual([]);
  });
});
