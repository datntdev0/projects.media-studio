// The manager's constructor names `ContentFileProvider`, and that file reaches the
// Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScheduledTask, ScheduleProvider } from '../core/providers/schedule.provider';
import { ScrapedContent, ScrapingProvider } from '../core/providers/scraping.provider';
import { ContentScrapeRequested, QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer, QueueSendOptions } from '../core/queues/queue.producer';
import { LibraryContent, LibraryContentStatus, NovelChapter } from '../library/entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from '../library/entities/library-item.entity';
import { LibraryContentCounts } from '../library/library-content.repository';
import { LibraryContentManager, ScrapedRow } from '../library/library-content.manager';
import { LibraryManager } from '../library/library.manager';
import { ScrapingJobDto } from './dto/scraping-job.dto';
import { ScrapingJobManager, selectByRange, wordCount } from './scraping-job.manager';

const NOW = '2026-08-11T09:12:04.113Z';

/** Three chapters, one done and two still owed — enough for a caller to see it was not the last. */
const COUNTS: LibraryContentCounts = { total: 3, completed: 1, failed: 0, pending: 2, bytes: 0 };

/** Nothing queued and nothing in flight: what a drained job leaves behind. */
const DRAINED: LibraryContentCounts = { total: 3, completed: 3, failed: 0, pending: 0, bytes: 0 };

const CRAWLER = 'novel543';

const SOURCE_URL = 'https://www.novel543.com/0413553971';

const CHAPTER_URL = 'https://www.novel543.com/0413553971/8096_527.html';

const OLD_TEXT_URL = 'http://127.0.0.1:9199/v0/b/bucket/o/content%2Fnovel-1%2Fold.txt?alt=media&token=1';

const NEW_TEXT_URL = 'http://127.0.0.1:9199/v0/b/bucket/o/content%2Fnovel-1%2Fnew.txt?alt=media&token=2';

/** An hour out, so a booking test is not a race against the clock. */
function soon(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

function novel(over: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: CRAWLER,
    sourceUrl: SOURCE_URL,
    status: LibraryItemStatus.Ready,
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: '', genres: [], description: '' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function chapter(over: Partial<NovelChapter> = {}): NovelChapter {
  return {
    id: `chapter-${over.index ?? 1}`,
    type: LibraryItemType.Novel,
    index: 1,
    title: 'Nine Bells for the Harbour',
    language: 'zh-Hant',
    words: 0,
    sourceUrl: CHAPTER_URL,
    contentUrl: null,
    status: LibraryContentStatus.Discovered,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** `1..count`, all discovered and all fetchable — the state discovery leaves behind. */
function chapters(count: number): NovelChapter[] {
  return Array.from({ length: count }, (_, at) => chapter({ index: at + 1 }));
}

function job(over: Partial<ScrapingJobDto> = {}): ScrapingJobDto {
  return { libraryId: 'novel-1', range: 'all', refetch: false, startAt: null, retry: 3, ...over };
}

/**
 * The collaborators, recorded rather than asserted on directly — with one `order`
 * log across all of them, because the order of the last three writes in `scrape` is
 * the thing worth pinning.
 */
function fixture(options: { items?: LibraryItem[], rows?: LibraryContent[], scraped?: ScrapedContent } = {}) {
  const order: string[] = [];
  const rows = options.rows ?? chapters(3);

  const library = {
    get: (id: string) => {
      const item = (options.items ?? [novel()]).find((each) => each.id === id);

      if (!item) {
        throw new NotFoundException(`No item ${id}`);
      }

      return Promise.resolve(item);
    },
    markScraping: jest.fn().mockResolvedValue(undefined),
    markReady: jest.fn().mockImplementation(() => {
      order.push('markReady');

      return Promise.resolve();
    }),
    markFailed: jest.fn().mockImplementation(() => {
      order.push('markFailed');

      return Promise.resolve();
    }),
  };

  const contents = {
    chapters: jest.fn().mockResolvedValue(rows),
    markQueued: jest.fn().mockResolvedValue(undefined),
    find: (itemId: string, contentId: string) => Promise.resolve(rows.find((row) => row.id === contentId) ?? null),
    markScraping: jest.fn().mockResolvedValue(undefined),
    completeScrape: jest.fn().mockImplementation((itemId: string, contentId: string, stored: ScrapedRow) => {
      order.push(`completeScrape:${stored.contentUrl}`);

      return Promise.resolve(COUNTS);
    }),
    // Answers with the counts, as `completeScrape` does — it recounts, and a job whose
    // last chapter fails is still a job that has drained.
    markFailed: jest.fn().mockResolvedValue(COUNTS),
  };

  const producer = { sendMany: jest.fn().mockResolvedValue(undefined) };
  // The task is kept rather than run, so a test can see that booking published nothing
  // and then fire it by hand.
  const schedule = { runAt: jest.fn<void, [string, Date, ScheduledTask]>(), booked: (): ScheduledTask => schedule.runAt.mock.calls[0][2] };
  const scraping = { content: jest.fn().mockResolvedValue(options.scraped ?? { title: '第五百二十七章', content: ['一', '二'] }) };
  const files = {
    saveText: jest.fn().mockImplementation(() => {
      order.push('saveText');

      return Promise.resolve(NEW_TEXT_URL);
    }),
    discard: jest.fn().mockImplementation((url: string | null) => {
      order.push(`discard:${url}`);

      return Promise.resolve();
    }),
  };

  const realtime = {
    clearContents: jest.fn().mockImplementation((itemId: string) => {
      order.push(`clearContents:${itemId}`);

      return Promise.resolve();
    }),
  };

  const manager = new ScrapingJobManager(
    library as unknown as LibraryManager,
    contents as unknown as LibraryContentManager,
    producer as unknown as QueueProducer,
    schedule as unknown as ScheduleProvider,
    scraping as unknown as ScrapingProvider,
    files as unknown as ContentFileProvider,
    realtime as unknown as RealtimeProvider,
  );

  return { manager, library, contents, producer, schedule, scraping, files, realtime, order, rows };
}

/** The payloads one `sendMany` was handed, and the options that went with them. */
function published(producer: { sendMany: jest.Mock }): { payloads: ContentScrapeRequested[], options?: QueueSendOptions } {
  const [topic, payloads, options] = (producer.sendMany.mock.calls[0] ?? []) as [QueueTopic, ContentScrapeRequested[], QueueSendOptions | undefined];

  expect(topic).toBe(QueueTopic.ContentScrapeRequested);

  return { payloads: payloads ?? [], options };
}

function message(over: Partial<ContentScrapeRequested> = {}): ContentScrapeRequested {
  return { itemId: 'novel-1', contentId: 'chapter-1', crawler: CRAWLER, sourceUrl: CHAPTER_URL, refetch: false, ...over };
}

describe('selectByRange', () => {
  const rows = [
    chapter({ index: 1, status: LibraryContentStatus.Completed }),
    chapter({ index: 2 }),
    chapter({ index: 3, status: LibraryContentStatus.Failed }),
    chapter({ index: 4 }),
  ];

  const indexesOf = (range: string) => selectByRange(range, rows).map((row) => row.index);

  it('takes every chapter for `all`', () => {
    expect(indexesOf('all')).toEqual([1, 2, 3, 4]);
  });

  it('takes every chapter that is not completed for `missing`', () => {
    expect(indexesOf('missing')).toEqual([2, 3, 4]);
  });

  it('reads a list of indexes', () => {
    expect(indexesOf('1,3')).toEqual([1, 3]);
  });

  it('reads a span, either separator, brackets or not', () => {
    expect(indexesOf('2-3')).toEqual([2, 3]);
    expect(indexesOf('[2:3]')).toEqual([2, 3]);
  });

  it('ignores whitespace, and an index the novel does not have', () => {
    expect(indexesOf(' 2 , 99 ')).toEqual([2]);
  });

  it.each(['nonsense', '2-', '0', '1.5', '-3', ''])('refuses `%s` as a range', (range) => {
    expect(() => selectByRange(range, rows)).toThrow(BadRequestException);
  });
});

describe('wordCount', () => {
  it('counts an unspaced script by character', () => {
    expect(wordCount('一二三')).toBe(3);
  });

  it('counts a spaced one by whitespace', () => {
    expect(wordCount('nine bells for the harbour')).toBe(5);
  });

  it('counts a mixed line as both', () => {
    expect(wordCount('第五章 chapter five')).toBe(5);
  });

  it('is zero for nothing at all', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
  });
});

describe('ScrapingJobManager.start', () => {
  it('marks the rows pending and publishes one message per chapter', async () => {
    const { manager, library, contents, producer } = fixture();
    const started = await manager.start(job());

    expect(started).toEqual({ queued: 3, skipped: 0, startAt: null });
    // The rows rather than their ids: each carries the number the live tree names it by.
    expect(contents.markQueued).toHaveBeenCalledWith('novel-1', [{ id: 'chapter-1', index: 1 }, { id: 'chapter-2', index: 2 }, { id: 'chapter-3', index: 3 }]);
    expect(library.markScraping).toHaveBeenCalledWith('novel-1');
    expect(published(producer).payloads).toEqual([message(), message({ contentId: 'chapter-2' }), message({ contentId: 'chapter-3' })]);
  });

  it('hands the queue one attempt more than the retries asked for', async () => {
    const { manager, producer } = fixture();

    await manager.start(job({ retry: 1 }));

    expect(published(producer).options).toEqual({ attempts: 2 });
  });

  it('drops a completed chapter unless refetch says otherwise', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Completed }), chapter({ index: 2 })];

    await expect(fixture({ rows }).manager.start(job())).resolves.toEqual({ queued: 1, skipped: 1, startAt: null });
    await expect(fixture({ rows }).manager.start(job({ refetch: true }))).resolves.toEqual({ queued: 2, skipped: 0, startAt: null });
  });

  it('carries refetch onto every message, since the consumer decides with it', async () => {
    const { manager, producer } = fixture();

    await manager.start(job({ refetch: true }));

    published(producer).payloads.forEach((payload) => expect(payload.refetch).toBe(true));
  });

  it('never queues a chapter added by hand, whatever the range said', async () => {
    const rows = [chapter({ index: 1, sourceUrl: null }), chapter({ index: 2 })];
    const { manager, producer } = fixture({ rows });

    await expect(manager.start(job())).resolves.toMatchObject({ queued: 1, skipped: 1 });
    expect(published(producer).payloads.map((payload) => payload.contentId)).toEqual(['chapter-2']);
  });

  it('answers with nothing queued rather than failing where the range matched none', async () => {
    const { manager, contents, producer } = fixture();

    await expect(manager.start(job({ range: '99' }))).resolves.toEqual({ queued: 0, skipped: 0, startAt: null });
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
  });

  it('books a start time and publishes nothing until it fires', async () => {
    const { manager, contents, producer, schedule } = fixture();
    const startAt = soon();
    const started = await manager.start(job({ startAt }));

    expect(started).toEqual({ queued: 3, skipped: 0, startAt });
    // The rows move now, so a job booked for 03:00 does not leave the screen untouched.
    expect(contents.markQueued).toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
    // Under the item's own name, so a second booking replaces the first.
    expect(schedule.runAt).toHaveBeenCalledWith('scrape:novel-1', new Date(startAt), expect.any(Function));

    await schedule.booked()();

    expect(published(producer).payloads).toHaveLength(3);
  });

  it('refuses a start time that has passed, before a row is written', async () => {
    const { manager, contents } = fixture();

    await expect(manager.start(job({ startAt: '2020-01-01T00:00:00.000Z' }))).rejects.toThrow(BadRequestException);
    expect(contents.markQueued).not.toHaveBeenCalled();
  });

  it('refuses a manual item', async () => {
    const items = [novel({ sourceMode: LibrarySourceMode.Manual, sourceUrl: null })];

    await expect(fixture({ items }).manager.start(job())).rejects.toThrow(BadRequestException);
  });

  it('refuses a set, which has no chapter to fetch', async () => {
    const items = [{ ...novel(), type: LibraryItemType.Image } as unknown as LibraryItem];

    await expect(fixture({ items }).manager.start(job())).rejects.toThrow(NotImplementedException);
  });

  it('is a 404 for an item that is not there, and for a crawler that is not', async () => {
    await expect(fixture().manager.start(job({ libraryId: 'missing' }))).rejects.toThrow(NotFoundException);
    await expect(fixture({ items: [novel({ sourceName: 'nowhere' })] }).manager.start(job())).rejects.toThrow(NotFoundException);
  });

  it('refuses a URL the crawler does not read', async () => {
    const items = [novel({ sourceUrl: 'https://example.com/0413553971' })];

    await expect(fixture({ items }).manager.start(job())).rejects.toThrow(BadRequestException);
  });
});

describe('ScrapingJobManager.scrape', () => {
  it('stores the joined lines and points the row at them', async () => {
    const { manager, contents, files } = fixture({ scraped: { title: '第五百二十七章', content: ['一二三', '四五六'] } });

    await manager.scrape(message());

    expect(contents.markScraping).toHaveBeenCalledWith('novel-1', 'chapter-1');
    // One newline between lines — what the reader splits on and what the editor writes.
    expect(files.saveText).toHaveBeenCalledWith('novel-1', '一二三\n四五六');
    expect(contents.completeScrape).toHaveBeenCalledWith('novel-1', 'chapter-1', { contentUrl: NEW_TEXT_URL, words: 6 });
  });

  it('writes the file, then the row, then discards what the row no longer points at', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Scraping, contentUrl: OLD_TEXT_URL })];
    const { manager, order } = fixture({ rows });

    await manager.scrape(message({ refetch: true }));

    // A row pointing at nothing is worse than an object nobody reads.
    expect(order).toEqual(['saveText', `completeScrape:${NEW_TEXT_URL}`, `discard:${OLD_TEXT_URL}`]);
  });

  it('returns the item to ready once the last chapter lands', async () => {
    const { manager, contents, library } = fixture();

    contents.completeScrape.mockResolvedValue(DRAINED);
    await manager.scrape(message());

    expect(library.markReady).toHaveBeenCalledWith('novel-1');
  });

  it('settles a job over a range, where the novel is nowhere near downloaded', async () => {
    const { manager, contents, library } = fixture();

    // Twenty of 1,305 fetched and nothing left owed. The old test — `completed === total`
    // — never fired here, so the item wore **Scraping** for good.
    contents.completeScrape.mockResolvedValue({ total: 1305, completed: 20, failed: 0, pending: 0, bytes: 0 });
    await manager.scrape(message());

    expect(library.markReady).toHaveBeenCalledWith('novel-1');
  });

  it('settles the item failed where the drained job left a row failed', async () => {
    const { manager, contents, library } = fixture();

    contents.completeScrape.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0, bytes: 0 });
    await manager.scrape(message());

    expect(library.markFailed).toHaveBeenCalledWith('novel-1');
    expect(library.markReady).not.toHaveBeenCalled();
  });

  it('drops the per-row subtree once the job settles, and not before', async () => {
    const { manager, contents, realtime } = fixture();

    await manager.scrape(message());
    expect(realtime.clearContents).not.toHaveBeenCalled();

    contents.completeScrape.mockResolvedValue(DRAINED);
    await manager.scrape(message());

    expect(realtime.clearContents).toHaveBeenCalledWith('novel-1');
  });

  it('leaves the item scraping while chapters remain', async () => {
    const { manager, library } = fixture();

    await manager.scrape(message());

    expect(library.markReady).not.toHaveBeenCalled();
  });

  it('is quiet about a row deleted between the send and the delivery', async () => {
    const { manager, contents, scraping } = fixture();

    await expect(manager.scrape(message({ contentId: 'gone' }))).resolves.toBeUndefined();
    expect(scraping.content).not.toHaveBeenCalled();
    expect(contents.markScraping).not.toHaveBeenCalled();
  });

  it('skips a re-delivered message for work already done', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Completed, contentUrl: OLD_TEXT_URL })];
    const { manager, scraping, files } = fixture({ rows });

    await manager.scrape(message());

    expect(scraping.content).not.toHaveBeenCalled();
    expect(files.saveText).not.toHaveBeenCalled();
  });

  it('fetches a completed row again when the job asked it to', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Completed, contentUrl: OLD_TEXT_URL })];
    const { manager, scraping } = fixture({ rows });

    await manager.scrape(message({ refetch: true }));

    expect(scraping.content).toHaveBeenCalledWith(CRAWLER, CHAPTER_URL);
  });

  it('stores nothing and leaves the row where it is when the source cannot be read', async () => {
    const { manager, scraping, files, contents } = fixture();

    scraping.content.mockRejectedValue(new Error('502 from the service'));

    // Throwing is how the consumer says *not done*, so BullMQ retries it.
    await expect(manager.scrape(message())).rejects.toThrow(/502/);
    expect(files.saveText).not.toHaveBeenCalled();
    expect(contents.completeScrape).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.fail', () => {
  it('marks the row failed once the attempts are spent', async () => {
    const { manager, contents } = fixture();

    await manager.fail(message());

    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', 'chapter-1');
  });

  it('settles the item where the failure was the last thing owed', async () => {
    const { manager, contents, library, realtime } = fixture();

    contents.markFailed.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0, bytes: 0 });
    await manager.fail(message());

    // Without this the item never leaves `scraping`: nothing else notices a queue that
    // drained on a failure rather than on a completion.
    expect(library.markFailed).toHaveBeenCalledWith('novel-1');
    expect(realtime.clearContents).toHaveBeenCalledWith('novel-1');
  });

  it('leaves the item alone while chapters are still owed', async () => {
    const { manager, library } = fixture();

    await manager.fail(message());

    expect(library.markFailed).not.toHaveBeenCalled();
  });
});
