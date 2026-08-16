// The manager's constructor names `ContentFileProvider`, and that file reaches the
// Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScrapedContent, ScrapingProvider } from '../core/providers/scraping.provider';
import { ScrapingContentRequested, QueueTopic, ScrapingJobRequested } from '../core/queues/queue.messages';
import { QueueProducer, QueueSendOptions } from '../core/queues/queue.producer';
import { LibraryContent, LibraryContentStatus, NovelChapter } from '../library/entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from '../library/entities/library-item.entity';
import { LibraryContentCounts } from '../library/library-content.repository';
import { LibraryContentManager, ScrapedRow } from '../library/library-content.manager';
import { LibraryManager } from '../library/library.manager';
import { QueryListScrapingJobsDto, ScrapingJobState } from './dto/query-list-scraping-jobs.dto';
import { CreateScrapingJobDto } from './dto/scraping-job.dto';
import { ScrapingJob, ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';
import { ScrapingJobDraft, ScrapingJobPatch, ScrapingJobRepository, ScrapingTaskCounts, ScrapingTaskDraft } from './scraping-job.repository';
import { ScrapingJobManager, selectByRange, wordCount } from './scraping-job.manager';

const NOW = '2026-08-11T09:12:04.113Z';

const JOB_ID = 'job-1';

/** Three rows, one done and two still owed — enough for a caller to see it was not the last. */
const COUNTS: LibraryContentCounts = { total: 3, completed: 1, failed: 0, pending: 2, bytes: 0 };

/** Nothing queued and nothing in flight: what a drained job leaves behind. */
const DRAINED: LibraryContentCounts = { total: 3, completed: 3, failed: 0, pending: 0, bytes: 0 };

/** The job's own tasks, with two still owed. */
const OWED: ScrapingTaskCounts = { total: 3, completed: 1, failed: 0, pending: 2, halted: 0 };

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
    // `get` and nothing else, deliberately: the runner does not write the item's own
    // status, so a call to one of the three `mark*` methods this class used to have is
    // a TypeError rather than an assertion nobody wrote.
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
    startTask: jest.fn().mockResolvedValue(undefined),
    // Moves the stored tasks rather than only recording the call: the consumer's gate
    // reads a task's status back, so a double that did not would let `scrape` run on
    // rows the publish had never moved out of `scheduled`.
    setTaskStatus: jest.fn().mockImplementation((jobId: string, contentIds: string[], status: ScrapingJobStatus) => {
      tasks.filter((task) => contentIds.includes(task.contentId)).forEach((task) => { task.status = status; });

      return Promise.resolve();
    }),
    counts: jest.fn().mockResolvedValue(OWED),
    findScheduled: jest.fn().mockResolvedValue([]),
    claim: jest.fn().mockResolvedValue(null),
    findMatching: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  const producer = { send: jest.fn().mockResolvedValue(undefined), sendMany: jest.fn().mockResolvedValue(undefined) };
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

  /** The live tree, recorded rather than written — nothing here reaches the database. */
  const realtime = {
    publishJob: jest.fn().mockResolvedValue(undefined),
    publishTasks: jest.fn().mockResolvedValue(undefined),
    publishTask: jest.fn().mockResolvedValue(undefined),
    runningJobs: jest.fn().mockResolvedValue({}),
    clearJob: jest.fn().mockResolvedValue(undefined),
  };

  const manager = new ScrapingJobManager(
    library as unknown as LibraryManager,
    contents as unknown as LibraryContentManager,
    jobs as unknown as ScrapingJobRepository,
    producer as unknown as QueueProducer,
    scraping as unknown as ScrapingProvider,
    files as unknown as ContentFileProvider,
    realtime as unknown as RealtimeProvider,
  );

  return { manager, library, contents, jobs, producer, scraping, files, realtime, order, rows, tasks };
}

/** The record one `create` wrote, as it went to the repository. */
function recorded(jobs: { create: jest.Mock }): ScrapingJobDraft {
  return (jobs.create.mock.calls[0] as [ScrapingJobDraft])[0];
}

/** That record as the repository handed it back — what a later tick finds. */
function stored(jobs: { create: jest.Mock }): ScrapingJob {
  return { ...recorded(jobs), id: JOB_ID, createdAt: NOW, updatedAt: NOW };
}

/** A record as the store holds it, for the paths that do not write one first. */
function record(over: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: JOB_ID,
    libraryId: 'novel-1',
    libraryType: LibraryItemType.Novel,
    libraryTitle: 'The Silent Cartographer',
    crawler: CRAWLER,
    status: ScrapingJobStatus.Queued,
    range: 'all',
    refetch: false,
    retry: 3,
    startAt: null,
    queuedAt: NOW,
    completedAt: null,
    total: 3,
    completed: 0,
    failed: 0,
    skipped: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** The payloads one `sendMany` was handed, and the options that went with them. */
function published(producer: { sendMany: jest.Mock }): { payloads: ScrapingContentRequested[], options?: QueueSendOptions } {
  const [topic, payloads, options] = (producer.sendMany.mock.calls[0] ?? []) as [QueueTopic, ScrapingContentRequested[], QueueSendOptions | undefined];

  expect(topic).toBe(QueueTopic.ScrapingContentRequested);

  return { payloads: payloads ?? [], options };
}

/** The one message a `create` sends: the fan-out asked for, not done. */
function asked(producer: { send: jest.Mock }): ScrapingJobRequested {
  const [topic, payload] = (producer.send.mock.calls[0] ?? []) as [QueueTopic, ScrapingJobRequested];

  expect(topic).toBe(QueueTopic.ScrapingJobRequested);

  return payload;
}

function message(over: Partial<ScrapingContentRequested> = {}): ScrapingContentRequested {
  return { jobId: JOB_ID, itemId: 'novel-1', contentId: 'chapter-1', crawler: CRAWLER, sourceUrl: CHAPTER_URL, refetch: false, retry: 3, ...over };
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
  it('writes the record and one task per chapter, then asks for the fan-out', async () => {
    const { manager, jobs, contents, producer } = fixture();
    const created = await manager.create(job());

    expect(recorded(jobs)).toMatchObject({ libraryId: 'novel-1', libraryTitle: 'The Silent Cartographer', crawler: CRAWLER, range: 'all', total: 3, skipped: 0 });
    expect(created.tasks.map((task) => task.contentId)).toEqual(['chapter-1', 'chapter-2', 'chapter-3']);
    // A thousand task writes and a thousand sends are the consumer's, not the caller's:
    // the request leaves with one message, and the record is already there to watch.
    expect(asked(producer)).toEqual({ jobId: JOB_ID });
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
  });

  it('asks for one delivery of it, since a redelivery would publish the job twice', async () => {
    const { manager, producer } = fixture();

    await manager.create(job());

    expect(producer.send).toHaveBeenCalledWith(QueueTopic.ScrapingJobRequested, { jobId: JOB_ID }, { attempts: 1 });
  });

  it('mirrors nothing yet — the node appears when the fan-out claims the tasks', async () => {
    const { manager, realtime } = fixture();

    await manager.create(job());

    expect(realtime.publishJob).not.toHaveBeenCalled();
    expect(realtime.publishTasks).not.toHaveBeenCalled();
  });

  it('writes the record before it publishes, so a restart between the two leaves a job', async () => {
    const { manager, jobs, producer } = fixture();

    await manager.create(job());

    expect(jobs.create.mock.invocationCallOrder[0]).toBeLessThan(producer.send.mock.invocationCallOrder[0]);
    expect(jobs.createTasks.mock.invocationCallOrder[0]).toBeLessThan(producer.send.mock.invocationCallOrder[0]);
  });

  it('drops a completed chapter unless refetch says otherwise', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Completed }), chapter({ index: 2 })];

    await expect(fixture({ rows }).manager.create(job())).resolves.toMatchObject({ total: 1, skipped: 1 });
    await expect(fixture({ rows }).manager.create(job({ refetch: true }))).resolves.toMatchObject({ total: 2, skipped: 0 });
  });

  it('never records a task for a chapter added by hand, whatever the range said', async () => {
    const rows = [chapter({ index: 1, sourceUrl: null }), chapter({ index: 2 })];

    await expect(fixture({ rows }).manager.create(job())).resolves.toMatchObject({ total: 1, skipped: 1 });
  });

  it('records a range that matched nothing as a completed job, rather than failing', async () => {
    const { manager, jobs, contents, producer } = fixture();
    const created = await manager.create(job({ range: '99' }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Completed, total: 0, tasks: [] });
    expect(recorded(jobs).completedAt).not.toBeNull();
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(producer.send).not.toHaveBeenCalled();
  });

  it('leaves a booked job scheduled, and the library exactly as it found it', async () => {
    const { manager, contents, producer } = fixture();
    const startAt = soon();
    const created = await manager.create(job({ startAt }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Scheduled, startAt, total: 3 });
    // The change the cron buys: a job booked for 03:00 no longer flips 1,305 rows to
    // pending at lunchtime.
    expect(contents.markQueued).not.toHaveBeenCalled();
    expect(producer.send).not.toHaveBeenCalled();
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

describe('ScrapingJobManager.publish', () => {
  /** A recorded job and its tasks — what the consumer finds when the publish message lands. */
  async function recordedJob(input: Partial<CreateScrapingJobDto> = {}, options: Parameters<typeof fixture>[0] = {}) {
    const context = fixture(options);

    await context.manager.create(job(input));

    return { ...context, due: stored(context.jobs) };
  }

  it('sends one message per task, and moves the rows and the tasks with them', async () => {
    const { manager, jobs, contents, producer, due } = await recordedJob();

    await manager.publishScrapingTaskMessages(due);

    expect(contents.markQueued).toHaveBeenCalledWith('novel-1', ['chapter-1', 'chapter-2', 'chapter-3']);
    expect(jobs.setTaskStatus).toHaveBeenCalledWith(JOB_ID, ['chapter-1', 'chapter-2', 'chapter-3'], ScrapingJobStatus.Queued);
    expect(published(producer).payloads).toEqual([message(), message({ contentId: 'chapter-2' }), message({ contentId: 'chapter-3' })]);
  });

  it('carries the retries onto every message, and asks the queue for one delivery', async () => {
    const { manager, producer, due } = await recordedJob({ retry: 1 });

    await manager.publishScrapingTaskMessages(due);

    // The retries are the consumer's to take within its own run, so a redelivery would
    // be a second chapter's worth of work nobody asked for.
    published(producer).payloads.forEach((payload) => expect(payload.retry).toBe(1));
    expect(published(producer).options).toEqual({ attempts: 1 });
  });

  it('carries refetch onto every message, since the consumer decides with it', async () => {
    const { manager, producer, due } = await recordedJob({ refetch: true });

    await manager.publishScrapingTaskMessages(due);

    published(producer).payloads.forEach((payload) => expect(payload.refetch).toBe(true));
  });

  it('never publishes a chapter added by hand, which has no source to read', async () => {
    const rows = [chapter({ index: 1, sourceUrl: null }), chapter({ index: 2 })];
    const { manager, producer, due } = await recordedJob({}, { rows });

    await manager.publishScrapingTaskMessages(due);

    expect(published(producer).payloads.map((payload) => payload.contentId)).toEqual(['chapter-2']);
  });

  it('mirrors the queued job and every task it claimed', async () => {
    const { manager, realtime, due } = await recordedJob();

    await manager.publishScrapingTaskMessages(due);

    expect(realtime.publishTasks).toHaveBeenLastCalledWith(JOB_ID, [
      { contentId: 'chapter-1', status: ScrapingJobStatus.Queued, index: 1 },
      { contentId: 'chapter-2', status: ScrapingJobStatus.Queued, index: 2 },
      { contentId: 'chapter-3', status: ScrapingJobStatus.Queued, index: 3 },
    ]);
    expect(realtime.publishJob).toHaveBeenLastCalledWith(expect.objectContaining({ id: JOB_ID, status: ScrapingJobStatus.Queued }));
  });
});

describe('ScrapingJobManager.list', () => {
  const query = (over: Partial<QueryListScrapingJobsDto> = {}): QueryListScrapingJobsDto => ({ page: 1, pageSize: 20, ...over });

  it.each([
    [ScrapingJobState.Active, [ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused]],
    [ScrapingJobState.Scheduled, [ScrapingJobStatus.Scheduled]],
    [ScrapingJobState.History, [ScrapingJobStatus.Stopped, ScrapingJobStatus.Completed, ScrapingJobStatus.Failed]],
  ])('maps the %s tab to the statuses it names', async (state, statuses) => {
    const { manager, jobs } = fixture();

    await manager.list(query({ state }));

    expect(jobs.findMatching).toHaveBeenCalledWith(expect.objectContaining({ statuses }));
  });

  it('narrows on no status at all where no tab was asked for', async () => {
    const { manager, jobs } = fixture();

    await manager.list(query({ libraryType: LibraryItemType.Novel, libraryId: 'novel-1' }));

    expect(jobs.findMatching).toHaveBeenCalledWith({ statuses: undefined, libraryType: LibraryItemType.Novel, libraryId: 'novel-1' });
  });

  it('answers newest first, each job carrying its tasks', async () => {
    const { manager, jobs } = fixture();

    jobs.findMatching.mockResolvedValue([record({ id: 'older', createdAt: '2026-08-10T00:00:00.000Z' }), record({ id: 'newer', createdAt: '2026-08-12T00:00:00.000Z' })]);
    jobs.tasks.mockResolvedValue([{ id: 'chapter-1', contentId: 'chapter-1' }]);

    const page = await manager.list(query());

    expect(page.items.map((job) => job.id)).toEqual(['newer', 'older']);
    expect(page.items[0].tasks).toHaveLength(1);
  });

  it('pages over what Firestore answered, and says how many matched', async () => {
    const { manager, jobs } = fixture();

    jobs.findMatching.mockResolvedValue([record({ id: 'a' }), record({ id: 'b' }), record({ id: 'c' })]);

    const page = await manager.list(query({ page: 2, pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
  });
});

describe('ScrapingJobManager.runDue', () => {
  /** A job described for later: the record written and its tasks stored, nothing published. */
  async function booked() {
    const context = fixture();

    await context.manager.create(job({ startAt: soon() }));

    return { ...context, due: stored(context.jobs) };
  }

  it('asks for what has come due, and publishes what it claims', async () => {
    const { manager, jobs, contents, producer, due } = await booked();

    jobs.findScheduled.mockResolvedValue([due]);
    jobs.claim.mockResolvedValue({ ...due, status: ScrapingJobStatus.Queued });
    await manager.runDueToScheduledJobs();

    expect(jobs.findScheduled).toHaveBeenCalledWith(expect.any(Date));
    expect(jobs.claim).toHaveBeenCalledWith(JOB_ID);
    expect(contents.markQueued).toHaveBeenCalled();
    expect(published(producer).payloads).toHaveLength(3);
    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Queued }));
  });

  it('skips a job a second instance claimed first', async () => {
    const { manager, jobs, producer, due } = await booked();

    // What the transaction answers the instance that lost: the job it did not get.
    jobs.findScheduled.mockResolvedValue([due]);
    jobs.claim.mockResolvedValue(null);
    await manager.runDueToScheduledJobs();

    expect(producer.sendMany).not.toHaveBeenCalled();
  });

  it('carries on after a job that will not publish', async () => {
    const { manager, jobs, producer, due } = await booked();

    jobs.findScheduled.mockResolvedValue([due, { ...due, id: 'job-2' }]);
    jobs.claim.mockImplementation((id: string) => Promise.resolve({ ...due, id, status: ScrapingJobStatus.Queued }));
    producer.sendMany.mockRejectedValueOnce(new Error('Redis is down'));

    await expect(manager.runDueToScheduledJobs()).resolves.toBeUndefined();
    expect(producer.sendMany).toHaveBeenCalledTimes(2);
  });

  it('is quiet when nothing is due', async () => {
    const { manager, jobs, producer } = fixture();

    await manager.runDueToScheduledJobs();

    expect(jobs.claim).not.toHaveBeenCalled();
    expect(producer.sendMany).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.setStatus', () => {
  /** A stored job in a given state, with three tasks the caller can restate. */
  function stored(status: ScrapingJobStatus, taskStatuses: ScrapingJobStatus[] = [ScrapingJobStatus.Queued, ScrapingJobStatus.Queued, ScrapingJobStatus.Queued]) {
    const context = fixture();

    context.jobs.findById.mockResolvedValue(record({ status }));
    context.tasks.push(...taskStatuses.map((each, at) => ({
      id: `chapter-${at + 1}`,
      contentId: `chapter-${at + 1}`,
      libraryId: 'novel-1',
      index: at + 1,
      sourceUrl: CHAPTER_URL,
      status: each,
      refetch: false,
      retry: 3,
      startAt: null,
      completedAt: null,
      error: null,
    })));

    return context;
  }

  it.each([
    ['queued', ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued],
    ['resumed', ScrapingJobStatus.Paused, ScrapingJobStatus.Queued],
    ['paused', ScrapingJobStatus.Queued, ScrapingJobStatus.Paused],
    ['paused mid-run', ScrapingJobStatus.Running, ScrapingJobStatus.Paused],
    ['stopped', ScrapingJobStatus.Running, ScrapingJobStatus.Stopped],
    ['stopped before it ran', ScrapingJobStatus.Scheduled, ScrapingJobStatus.Stopped],
  ])('a %s job is written and mirrored', async (_name, from, to) => {
    const { manager, jobs, realtime } = stored(from);

    await expect(manager.setStatus(JOB_ID, to)).resolves.toMatchObject({ id: JOB_ID });
    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: to }));
    expect(realtime.publishJob).toHaveBeenCalledWith(expect.objectContaining({ id: JOB_ID, status: to }));
  });

  it.each([
    ['queued from running', ScrapingJobStatus.Running, ScrapingJobStatus.Queued],
    ['paused from paused', ScrapingJobStatus.Paused, ScrapingJobStatus.Paused],
    ['paused from scheduled', ScrapingJobStatus.Scheduled, ScrapingJobStatus.Paused],
    ['anything of a completed job', ScrapingJobStatus.Completed, ScrapingJobStatus.Paused],
    ['anything of a stopped job', ScrapingJobStatus.Stopped, ScrapingJobStatus.Queued],
    ['anything of a failed job', ScrapingJobStatus.Failed, ScrapingJobStatus.Stopped],
  ])('refuses %s, naming what it can come from', async (_name, from, to) => {
    const { manager, jobs } = stored(from);

    await expect(manager.setStatus(JOB_ID, to)).rejects.toThrow(BadRequestException);
    expect(jobs.patch).not.toHaveBeenCalled();
  });

  it('is a 404 for a job that is not there', async () => {
    const { manager } = fixture();

    await expect(manager.setStatus('missing', ScrapingJobStatus.Stopped)).rejects.toThrow(NotFoundException);
  });

  it('pauses the tasks nobody has picked up, and leaves the one in flight', async () => {
    const { manager, jobs } = stored(ScrapingJobStatus.Running, [ScrapingJobStatus.Completed, ScrapingJobStatus.Running, ScrapingJobStatus.Queued]);

    await manager.setStatus(JOB_ID, ScrapingJobStatus.Paused);

    // Only the third: a completed task is settled, and a running one has a fetch in the
    // air that will write its own completion a chapter later.
    expect(jobs.setTaskStatus).toHaveBeenCalledWith(JOB_ID, ['chapter-3'], ScrapingJobStatus.Paused);
  });

  it('stamps a stopped job as settled, and a paused one not', async () => {
    const stopped = stored(ScrapingJobStatus.Running);

    await stopped.manager.setStatus(JOB_ID, ScrapingJobStatus.Stopped);

    const [, fields] = stopped.jobs.patch.mock.calls[0] as [string, ScrapingJobPatch];

    // Stopping is where a job ends; pausing is a state it is expected to leave again,
    // so only one of the two is stamped.
    expect(fields.status).toBe(ScrapingJobStatus.Stopped);
    expect(typeof fields.completedAt).toBe('string');

    const paused = stored(ScrapingJobStatus.Running);

    await paused.manager.setStatus(JOB_ID, ScrapingJobStatus.Paused);
    expect(paused.jobs.patch).toHaveBeenCalledWith(JOB_ID, { status: ScrapingJobStatus.Paused });
  });

  it('republishes only what is unfinished when a paused job resumes', async () => {
    const { manager, producer } = stored(ScrapingJobStatus.Paused, [ScrapingJobStatus.Completed, ScrapingJobStatus.Paused, ScrapingJobStatus.Paused]);

    await manager.setStatus(JOB_ID, ScrapingJobStatus.Queued);

    expect(published(producer).payloads.map((payload) => payload.contentId)).toEqual(['chapter-2', 'chapter-3']);
  });
});

describe('ScrapingJobManager.remove', () => {
  it.each([ScrapingJobStatus.Completed, ScrapingJobStatus.Failed, ScrapingJobStatus.Stopped])('deletes a %s job and takes its node with it', async (status) => {
    const { manager, jobs, realtime } = fixture();

    jobs.findById.mockResolvedValue(record({ status }));

    await expect(manager.remove(JOB_ID)).resolves.toBeUndefined();
    expect(jobs.remove).toHaveBeenCalledWith(JOB_ID);
    // Not left to the sweep: that works from the node's own status, and the record
    // explaining it has just gone.
    expect(realtime.clearJob).toHaveBeenCalledWith(JOB_ID);
  });

  it.each([ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused])('refuses to delete a %s job', async (status) => {
    const { manager, jobs, realtime } = fixture();

    jobs.findById.mockResolvedValue(record({ status }));

    // Its messages are still in Redis: deleting the record under them would have every
    // one of them arrive to find a task that is not there.
    await expect(manager.remove(JOB_ID)).rejects.toThrow(BadRequestException);
    expect(jobs.remove).not.toHaveBeenCalled();
    expect(realtime.clearJob).not.toHaveBeenCalled();
  });

  it('is a 404 for a job that is not there', async () => {
    const { manager, jobs } = fixture();

    await expect(manager.remove('missing')).rejects.toThrow(NotFoundException);
    expect(jobs.remove).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.sweep', () => {
  it('takes the settled nodes out of the live tree, and leaves the rest', async () => {
    const { manager, realtime } = fixture();

    realtime.runningJobs.mockResolvedValue({
      'job-running': ScrapingJobStatus.Running,
      'job-queued': ScrapingJobStatus.Queued,
      'job-paused': ScrapingJobStatus.Paused,
      'job-done': ScrapingJobStatus.Completed,
      'job-failed': ScrapingJobStatus.Failed,
      'job-stopped': ScrapingJobStatus.Stopped,
    });

    await manager.sweep();

    expect(realtime.clearJob.mock.calls.map(([id]: [string]) => id)).toEqual(['job-done', 'job-failed', 'job-stopped']);
  });

  it('does nothing where the tree is empty, or could not be read', async () => {
    const { manager, realtime } = fixture();

    await manager.sweep();

    expect(realtime.clearJob).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.scrape', () => {
  it('stores the joined lines and points the row at them', async () => {
    const { manager, contents, files, rows } = fixture({ scraped: { title: '第五百二十七章', content: ['一二三', '四五六'] } });

    await manager.scrape(message(), rows[0]);

    // One newline between lines — what the reader splits on and what the editor writes.
    expect(files.saveText).toHaveBeenCalledWith('novel-1', '一二三\n四五六');
    expect(contents.completeScrape).toHaveBeenCalledWith('novel-1', 'chapter-1', { contentUrl: NEW_TEXT_URL, words: 6 });
  });

  it('writes the file, then the row, then discards what the row no longer points at', async () => {
    const rows = [chapter({ index: 1, status: LibraryContentStatus.Scraping, contentUrl: OLD_TEXT_URL })];
    const { manager, order } = fixture({ rows });

    await manager.scrape(message({ refetch: true }), rows[0]);

    // A row pointing at nothing is worse than an object nobody reads.
    expect(order).toEqual(['saveText', `completeScrape:${NEW_TEXT_URL}`, `discard:${OLD_TEXT_URL}`]);
  });

  it('never writes the item\'s own status, however the chapter lands', async () => {
    const { manager, contents, rows } = fixture();

    // `Draft` and `Ready` are the person's, and a background job must not promote one
    // behind them. The `library` double has no `mark*` method to call, so a runner that
    // reached for the item's status would throw here rather than pass quietly.
    contents.completeScrape.mockResolvedValue(DRAINED);
    await expect(manager.scrape(message(), rows[0])).resolves.toBeUndefined();
  });

  it('stores nothing and leaves the row where it is when the source cannot be read', async () => {
    const { manager, scraping, files, contents, rows } = fixture();

    scraping.content.mockRejectedValue(new Error('502 from the service'));

    // Throwing is how the consumer says *not done*, so it takes its next attempt.
    await expect(manager.scrape(message(), rows[0])).rejects.toThrow(/502/);
    expect(files.saveText).not.toHaveBeenCalled();
    expect(contents.completeScrape).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.settleJob', () => {
  it('keeps the job\'s counters in step with its tasks', async () => {
    const { manager, jobs } = fixture();

    await manager.settleJob(JOB_ID);

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, { completed: 1, failed: 0 });
  });

  it('settles the job on its own tasks once none is owed', async () => {
    const { manager, jobs } = fixture();

    jobs.counts.mockResolvedValue({ total: 3, completed: 3, failed: 0, pending: 0, halted: 0 });
    await manager.settleJob(JOB_ID);

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Completed, completed: 3 }));
  });

  it('settles the job failed where one of its tasks failed', async () => {
    const { manager, jobs } = fixture();

    jobs.counts.mockResolvedValue({ total: 3, completed: 2, failed: 1, pending: 0, halted: 0 });
    await manager.settleJob(JOB_ID);

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Failed }));
  });

  it('does not settle a halted job when its last chapter in flight lands', async () => {
    const { manager, jobs } = fixture();

    // What a pause leaves behind: its queued tasks moved to `paused`, and one chapter
    // still fetching. Those tasks are no longer *owed*, so a test on `pending` alone
    // reads the job as drained and stamps `completed` over the status just asked for.
    // A stopped job loses its own status the same way — `halted` covers both.
    jobs.counts.mockResolvedValue({ total: 3, completed: 2, failed: 0, pending: 0, halted: 1 });
    await manager.settleJob(JOB_ID);

    expect(jobs.patch).toHaveBeenCalledWith(JOB_ID, { completed: 2, failed: 0 });
    expect(jobs.patch).not.toHaveBeenCalledWith(JOB_ID, expect.objectContaining({ status: ScrapingJobStatus.Completed }));
  });

  it('leaves the settled job in the live tree, for the sweep to take a tick later', async () => {
    const { manager, jobs, realtime } = fixture();

    jobs.counts.mockResolvedValue({ total: 3, completed: 3, failed: 0, pending: 0, halted: 0 });
    await manager.settleJob(JOB_ID);

    // Removing the node in the same act would race the refetch the screen makes when
    // it sees the transition — which is the whole reason the sweep is a tick behind.
    expect(realtime.clearJob).not.toHaveBeenCalled();
    expect(realtime.publishJob).toHaveBeenCalledWith(expect.objectContaining({ id: JOB_ID, status: ScrapingJobStatus.Completed }));
  });
});

describe('ScrapingJobManager.retry', () => {
  it('puts the task back in the queue, carrying what ended the attempt', async () => {
    const { manager, jobs, realtime } = fixture();

    await manager.retry(message(), '502 from the service');

    expect(jobs.patchTask).toHaveBeenCalledWith(JOB_ID, 'chapter-1', { status: ScrapingJobStatus.Queued, error: '502 from the service' });
    expect(realtime.publishTask).toHaveBeenCalledWith(JOB_ID, 'chapter-1', ScrapingJobStatus.Queued);
  });

  it('marks the row failed now, rather than leaving it scraping until the attempts are spent', async () => {
    const { manager, contents } = fixture();

    await manager.retry(message(), '502 from the service');

    // A chapter whose fetch just failed is not being scraped, and the next attempt is a
    // backoff and a service timeout away.
    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', ['chapter-1']);
  });

  it('leaves the job itself where it stands, since the chapter is still owed', async () => {
    const { manager, jobs, realtime } = fixture();

    await manager.retry(message(), '502 from the service');

    // A job settled between two attempts would contradict the retry — and its counters
    // are its tasks', which have not moved.
    expect(jobs.patch).not.toHaveBeenCalled();
    expect(jobs.counts).not.toHaveBeenCalled();
    expect(realtime.publishJob).not.toHaveBeenCalled();
  });
});

describe('ScrapingJobManager.fail', () => {
  it('marks the task and the row failed once the attempts are spent', async () => {
    const { manager, jobs, contents } = fixture();

    await manager.fail(message(), '502 from the service');

    expect(jobs.patchTask).toHaveBeenCalledWith(JOB_ID, 'chapter-1', expect.objectContaining({ status: ScrapingJobStatus.Failed, error: '502 from the service' }));
    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', ['chapter-1']);
  });

  it('publishes the task and settles the job, but never the item\'s own status', async () => {
    const { manager, realtime } = fixture();

    await manager.fail(message(), 'gave up');

    // The item's own status is left exactly where the person put it — the `library`
    // double has no method that could move it.
    expect(realtime.publishTask).toHaveBeenCalledWith(JOB_ID, 'chapter-1', ScrapingJobStatus.Failed);
    expect(realtime.publishJob).toHaveBeenLastCalledWith(expect.objectContaining({ id: JOB_ID, completed: 1, failed: 0 }));
  });
});
