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
import { CreateScrapingJobDto } from './dto/scraping-job.dto';
import { ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';
import { ScrapingJobDraft, ScrapingJobRepository, ScrapingTaskCounts, ScrapingTaskDraft } from './scraping-job.repository';
import { ScrapingJobManager, selectByRange, wordCount } from './scraping-job.manager';

const NOW = '2026-08-11T09:12:04.113Z';

const JOB_ID = 'job-1';

/** Three rows, one done and two still owed — enough for a caller to see it was not the last. */
const COUNTS: LibraryContentCounts = { total: 3, completed: 1, failed: 0, pending: 2, bytes: 0 };

/** Nothing queued and nothing in flight: what a drained job leaves behind. */
const DRAINED: LibraryContentCounts = { total: 3, completed: 3, failed: 0, pending: 0, bytes: 0 };

/** The job's own tasks, with two still owed. */
const OWED: ScrapingTaskCounts = { total: 3, completed: 1, failed: 0, pending: 2 };

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

function job(over: Partial<CreateScrapingJobDto> = {}): CreateScrapingJobDto {
  return { libraryId: 'novel-1', range: 'all', refetch: false, startAt: null, retry: 3, ...over };
}

/**
 * The collaborators, recorded rather than asserted on directly — with one `order`
 * log across all of them, because the order of the last three writes in `scrape` is
 * the thing worth pinning.
 *
 * The job repository is the one double that keeps state: the tasks a `create` writes
 * are what the publish beside it reads back.
 */
function fixture(options: { items?: LibraryItem[], rows?: LibraryContent[], scraped?: ScrapedContent } = {}) {
  const order: string[] = [];
  const rows = options.rows ?? chapters(3);
  const tasks: ScrapingTask[] = [];

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

  const jobs = {
    create: jest.fn().mockImplementation((draft: ScrapingJobDraft) => Promise.resolve({ ...draft, id: JOB_ID, createdAt: NOW, updatedAt: NOW })),
    createTasks: jest.fn().mockImplementation((jobId: string, drafts: ScrapingTaskDraft[]) => {
      tasks.push(...drafts.map((draft) => ({ ...draft, id: draft.contentId })));

      return Promise.resolve();
    }),
    tasks: jest.fn().mockImplementation(() => Promise.resolve(tasks)),
    task: jest.fn().mockImplementation((jobId: string, contentId: string) => Promise.resolve(tasks.find((each) => each.contentId === contentId) ?? null)),
    patch: jest.fn().mockResolvedValue(undefined),
    patchTask: jest.fn().mockResolvedValue(undefined),
    setTaskStatus: jest.fn().mockResolvedValue(undefined),
    counts: jest.fn().mockResolvedValue(OWED),
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
    jobs as unknown as ScrapingJobRepository,
    producer as unknown as QueueProducer,
    schedule as unknown as ScheduleProvider,
    scraping as unknown as ScrapingProvider,
    files as unknown as ContentFileProvider,
    realtime as unknown as RealtimeProvider,
  );

  return { manager, library, contents, jobs, producer, schedule, scraping, files, realtime, order, rows, tasks };
}

/** The record one `create` wrote, as it went to the repository. */
function recorded(jobs: { create: jest.Mock }): ScrapingJobDraft {
  return jobs.create.mock.calls[0][0] as ScrapingJobDraft;
}

/** The payloads one `sendMany` was handed, and the options that went with them. */
function published(producer: { sendMany: jest.Mock }): { payloads: ContentScrapeRequested[], options?: QueueSendOptions } {
  const [topic, payloads, options] = (producer.sendMany.mock.calls[0] ?? []) as [QueueTopic, ContentScrapeRequested[], QueueSendOptions | undefined];

  expect(topic).toBe(QueueTopic.ContentScrapeRequested);

  return { payloads: payloads ?? [], options };
}

function message(over: Partial<ContentScrapeRequested> = {}): ContentScrapeRequested {
  return { jobId: JOB_ID, itemId: 'novel-1', contentId: 'chapter-1', crawler: CRAWLER, sourceUrl: CHAPTER_URL, refetch: false, ...over };
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

describe('ScrapingJobManager.create', () => {
  it('writes the record and one task per chapter, then publishes', async () => {
    const { manager, jobs, library, contents, producer } = fixture();
    const created = await manager.create(job());

    expect(recorded(jobs)).toMatchObject({ libraryId: 'novel-1', libraryTitle: 'The Silent Cartographer', crawler: CRAWLER, range: 'all', total: 3, skipped: 0 });
    expect(created.tasks.map((task) => task.contentId)).toEqual(['chapter-1', 'chapter-2', 'chapter-3']);
    // The rows rather than their ids: each carries the number the live tree names it by.
    expect(contents.markQueued).toHaveBeenCalledWith('novel-1', [{ id: 'chapter-1', index: 1 }, { id: 'chapter-2', index: 2 }, { id: 'chapter-3', index: 3 }]);
    expect(library.markScraping).toHaveBeenCalledWith('novel-1');
    expect(published(producer).payloads).toEqual([message(), message({ contentId: 'chapter-2' }), message({ contentId: 'chapter-3' })]);
  });

  it('writes the record before it publishes, so a restart between the two leaves a job', async () => {
    const { manager, jobs, producer } = fixture();

    await manager.create(job());

    expect(jobs.create.mock.invocationCallOrder[0]).toBeLessThan(producer.sendMany.mock.invocationCallOrder[0]);
    expect(jobs.createTasks.mock.invocationCallOrder[0]).toBeLessThan(producer.sendMany.mock.invocationCallOrder[0]);
  });

  it('hands the queue one attempt more than the retries asked for', async () => {
    const { manager, producer } = fixture();

    await manager.create(job({ retry: 1 }));

    expect(published(producer).options).toEqual({ attempts: 2 });
  });

  it('drops a completed chapter unless refetch says otherwise', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Completed }), chapter({ index: 2 })];

    await expect(fixture({ rows }).manager.create(job())).resolves.toMatchObject({ total: 1, skipped: 1 });
    await expect(fixture({ rows }).manager.create(job({ refetch: true }))).resolves.toMatchObject({ total: 2, skipped: 0 });
  });

  it('carries refetch onto every message, since the consumer decides with it', async () => {
    const { manager, producer } = fixture();

    await manager.create(job({ refetch: true }));

    published(producer).payloads.forEach((payload) => expect(payload.refetch).toBe(true));
  });

  it('never queues a chapter added by hand, whatever the range said', async () => {
    const rows = [chapter({ index: 1, sourceUrl: null }), chapter({ index: 2 })];
    const { manager, producer } = fixture({ rows });

    await expect(manager.create(job())).resolves.toMatchObject({ total: 1, skipped: 1 });
    expect(published(producer).payloads.map((payload) => payload.contentId)).toEqual(['chapter-2']);
  });

  it('records a range that matched nothing as a completed job, rather than failing', async () => {
    const { manager, jobs, contents, producer } = fixture();
    const created = await manager.create(job({ range: '99' }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Completed, total: 0, tasks: [] });
    expect(recorded(jobs).completedAt).not.toBeNull();
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
  });

  it('books a start time, and leaves the library alone until it fires', async () => {
    const { manager, jobs, contents, library, producer, schedule } = fixture();
    const startAt = soon();
    const created = await manager.create(job({ startAt }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Scheduled, startAt, total: 3 });
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(library.markScraping).not.toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
    expect(schedule.runAt).toHaveBeenCalledWith(`scrape:${JOB_ID}`, new Date(startAt), expect.any(Function));

    await schedule.booked()();

    expect(published(producer).payloads).toHaveLength(3);
    expect(contents.markQueued).toHaveBeenCalled();
    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Queued }));
  });

  it('refuses a start time that has passed, before a record is written', async () => {
    const { manager, jobs } = fixture();

    await expect(manager.create(job({ startAt: '2020-01-01T00:00:00.000Z' }))).rejects.toThrow(BadRequestException);
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it('refuses a manual item', async () => {
    const items = [novel({ sourceMode: LibrarySourceMode.Manual, sourceUrl: null })];

    await expect(fixture({ items }).manager.create(job())).rejects.toThrow(BadRequestException);
  });

  it('refuses a set, which has no chapter to fetch', async () => {
    const items = [{ ...novel(), type: LibraryItemType.Image } as unknown as LibraryItem];

    await expect(fixture({ items }).manager.create(job())).rejects.toThrow(NotImplementedException);
  });

  it('is a 404 for an item that is not there, and for a crawler that is not', async () => {
    await expect(fixture().manager.create(job({ libraryId: 'missing' }))).rejects.toThrow(NotFoundException);
    await expect(fixture({ items: [novel({ sourceName: 'nowhere' })] }).manager.create(job())).rejects.toThrow(NotFoundException);
  });

  it('refuses a URL the crawler does not read', async () => {
    const items = [novel({ sourceUrl: 'https://example.com/0413553971' })];

    await expect(fixture({ items }).manager.create(job())).rejects.toThrow(BadRequestException);
  });
});

describe('ScrapingJobManager.scrape', () => {
  /** A job whose tasks are already written, which is what a message arrives against. */
  async function started(options: Parameters<typeof fixture>[0] = {}) {
    const context = fixture(options);

    await context.manager.create(job());
    context.jobs.patch.mockClear();

    return context;
  }

  it('stores the joined lines and points the row at them', async () => {
    const { manager, contents, files } = await started({ scraped: { title: '第五百二十七章', content: ['一二三', '四五六'] } });

    await manager.scrape(message());

    // One newline between lines — what the reader splits on and what the editor writes.
    expect(files.saveText).toHaveBeenCalledWith('novel-1', '一二三\n四五六');
    expect(contents.completeScrape).toHaveBeenCalledWith('novel-1', 'chapter-1', { contentUrl: NEW_TEXT_URL, words: 6 });
  });

  it('moves its task through running and into completed', async () => {
    const { manager, jobs } = await started();

    await manager.scrape(message());

    expect(jobs.patchTask).toHaveBeenNthCalledWith(1, JOB_ID, 'chapter-1', expect.objectContaining({ status: ScrapingJobStatus.Running }));
    expect(jobs.patchTask).toHaveBeenNthCalledWith(2, JOB_ID, 'chapter-1', expect.objectContaining({ status: ScrapingJobStatus.Completed }));
  });

  it('writes the file, then the row, then discards what the row no longer points at', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Scraping, contentUrl: OLD_TEXT_URL })];
    const { manager, order } = await started({ rows });

    await manager.scrape(message({ refetch: true }));

    // A row pointing at nothing is worse than an object nobody reads.
    expect(order).toEqual(['saveText', `completeScrape:${NEW_TEXT_URL}`, `discard:${OLD_TEXT_URL}`]);
  });

  it('keeps the job\'s counters in step with its tasks', async () => {
    const { manager, jobs } = await started();

    await manager.scrape(message());

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, { completed: 1, failed: 0 });
  });

  it('settles the job on its own tasks once none is owed', async () => {
    const { manager, jobs } = await started();

    jobs.counts.mockResolvedValue({ total: 3, completed: 3, failed: 0, pending: 0 });
    await manager.scrape(message());

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Completed, completed: 3 }));
  });

  it('settles the job failed where one of its tasks failed', async () => {
    const { manager, jobs } = await started();

    jobs.counts.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0 });
    await manager.scrape(message());

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Failed }));
  });

  it('returns the item to ready once the last chapter lands', async () => {
    const { manager, contents, library } = await started();

    contents.completeScrape.mockResolvedValue(DRAINED);
    await manager.scrape(message());

    expect(library.markReady).toHaveBeenCalledWith('novel-1');
  });

  it('settles a job over a range, where the novel is nowhere near downloaded', async () => {
    const { manager, contents, library } = await started();

    // Twenty of 1,305 fetched and nothing left owed. `completed === total` asks whether
    // the *novel* is downloaded, so the item would wear **Scraping** for good.
    contents.completeScrape.mockResolvedValue({ total: 1305, completed: 20, failed: 0, pending: 0, bytes: 0 });
    await manager.scrape(message());

    expect(library.markReady).toHaveBeenCalledWith('novel-1');
  });

  it('settles the item failed where the drained job left a row failed', async () => {
    const { manager, contents, library } = await started();

    contents.completeScrape.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0, bytes: 0 });
    await manager.scrape(message());

    expect(library.markFailed).toHaveBeenCalledWith('novel-1');
    expect(library.markReady).not.toHaveBeenCalled();
  });

  it('drops the per-row subtree once the item settles, and not before', async () => {
    const { manager, contents, realtime } = await started();

    await manager.scrape(message());
    expect(realtime.clearContents).not.toHaveBeenCalled();

    contents.completeScrape.mockResolvedValue(DRAINED);
    await manager.scrape(message());

    expect(realtime.clearContents).toHaveBeenCalledWith('novel-1');
  });

  it('leaves the item scraping while chapters remain', async () => {
    const { manager, library } = await started();

    await manager.scrape(message());

    expect(library.markReady).not.toHaveBeenCalled();
  });

  it('is quiet about a job deleted between the send and the delivery', async () => {
    const { manager, scraping } = await started();

    await expect(manager.scrape(message({ contentId: 'gone' }))).resolves.toBeUndefined();
    expect(scraping.content).not.toHaveBeenCalled();
  });

  it('fails the task where the library row is gone, so the job can still drain', async () => {
    const rows = [chapter({ index: 1 }), chapter({ index: 2 })];
    const { manager, jobs, rows: stored, scraping } = await started({ rows });

    // The row goes after the job claimed it — an item deleted mid-run.
    stored.length = 0;
    await manager.scrape(message());

    expect(scraping.content).not.toHaveBeenCalled();
    expect(jobs.patchTask).toHaveBeenLastCalledWith(JOB_ID, 'chapter-1', expect.objectContaining({ status: ScrapingJobStatus.Failed, error: expect.any(String) }));
    expect(jobs.patch).toHaveBeenCalled();
  });

  it('stores nothing and leaves the row where it is when the source cannot be read', async () => {
    const { manager, scraping, files, contents } = await started();

    scraping.content.mockRejectedValue(new Error('502 from the service'));

    // Throwing is how the consumer says *not done*, so BullMQ retries it.
    await expect(manager.scrape(message())).rejects.toThrow(/502/);
    expect(files.saveText).not.toHaveBeenCalled();
    expect(contents.completeScrape).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.fail', () => {
  it('marks the task and the row failed once the attempts are spent', async () => {
    const { manager, jobs, contents } = fixture();

    await manager.fail(message(), '502 from the service');

    expect(jobs.patchTask).toHaveBeenCalledWith(JOB_ID, 'chapter-1', expect.objectContaining({ status: ScrapingJobStatus.Failed, error: '502 from the service' }));
    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', 'chapter-1');
  });

  it('settles the item where the failure was the last thing owed', async () => {
    const { manager, contents, library, realtime } = fixture();

    contents.markFailed.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0, bytes: 0 });
    await manager.fail(message(), 'gave up');

    // Without this the item never leaves `scraping`: nothing else notices a queue that
    // drained on a failure rather than on a completion.
    expect(library.markFailed).toHaveBeenCalledWith('novel-1');
    expect(realtime.clearContents).toHaveBeenCalledWith('novel-1');
  });

  it('leaves the item alone while chapters are still owed', async () => {
    const { manager, library } = fixture();

    await manager.fail(message(), 'gave up');

    expect(library.markFailed).not.toHaveBeenCalled();
  });
});
