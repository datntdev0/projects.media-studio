// The repositories' constructors name `FirebaseAdminService`, and the providers below
// name it too — that file reaches the Admin SDK, where `firebase-admin/auth` pulls in
// an ESM-only dependency Jest cannot require. Nothing here talks to Firebase.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { AppConfigService } from '../core/config/app-config.service';
import { CacheProvider, CacheType } from '../core/providers/cache.provider';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScrapedChapter, ScrapedCover, ScrapedNovel, ScrapingProvider } from '../core/providers/scraping.provider';
import { QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { CONTENT_SUBCOLLECTION, LIBRARY_COLLECTION, SCRAPING_JOB_COLLECTION, TASK_SUBCOLLECTION } from '../core/firebase/collections';
import { ContentLanguages, LibraryContent, LibraryContentStatus, LibraryContentType } from '../library/entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from '../library/entities/library-item.entity';
import { LibraryContentManager } from '../library/library-content.manager';
import { LibraryItemManager } from '../library/library-item.manager';
import { LibraryRepository } from '../library/library.repository';
import { PreviewRequestDto } from './dto/preview.dto';
import { CreateScrapingJobDto } from './dto/scraping-job.dto-create';
import { QueryListScrapingJobsDto, ScrapingJobState } from './dto/scraping-job.dto';
import { UpdateScrapingJobStatusDto } from './dto/scraping-job.dto-update';
import { ScrapingJob, ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';
import { ScrapingRepository } from './scraping.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const CRAWLER = 'novel543';

const SOURCE_URL = 'https://www.novel543.com/0413553971';

const CHAPTER_URL = 'https://www.novel543.com/0413553971/8096_527.html';

type Row = Record<string, unknown>;

/** One subcollection's own rows, keyed by their own id. */
type SubcollectionRows = Map<string, Row>;

/** One document's own subcollections, by name — mirrors what a real `CollectionReference` opens. */
type DocSubcollections = Map<string, SubcollectionRows>;

/**
 * One Firestore collection, held in memory — just enough of `where`/`orderBy`/`limit`/
 * `get`/`doc`/`count` for `LibraryRepository` and `ScrapingRepository` above it.
 *
 * Generalised over `library.controller.spec.ts`'s version: a subcollection is opened by
 * name rather than hardcoded to `contents`, so the same class serves an item's `contents`
 * and a job's `tasks`.
 */
/**
 * Shared across every `FakeCollection` instance, because `FakeDoc.collection()` hands
 * back a fresh wrapper on each call — an id generated from an instance counter would
 * collide the moment two rows are added to the same subcollection across two calls.
 */
let autoId = 0;

class FakeCollection {
  constructor(
    private readonly rows: Map<string, Row>,
    private readonly subcollectionsByDoc: Map<string, DocSubcollections> = new Map(),
    private readonly filters: [string, string, unknown][] = [],
    private readonly order?: string,
  ) {}

  static seeded(rows: Row[], subcollectionName?: string, subRows: Record<string, Row[]> = {}): FakeCollection {
    const byId = new Map<string, Row>();

    rows.forEach(({ id, ...data }) => byId.set(id as string, data));

    const subcollectionsByDoc = new Map<string, DocSubcollections>();

    if (subcollectionName) {
      Object.entries(subRows).forEach(([parentId, children]) => {
        const childRows = new Map<string, Row>();

        children.forEach(({ id, ...data }) => childRows.set(id as string, data));
        subcollectionsByDoc.set(parentId, new Map([[subcollectionName, childRows]]));
      });
    }

    return new FakeCollection(byId, subcollectionsByDoc);
  }

  where(field: string, op: '==' | 'in' | '<=', value: unknown): FakeCollection {
    return new FakeCollection(this.rows, this.subcollectionsByDoc, [...this.filters, [field, op, value]], this.order);
  }

  orderBy(field: string): FakeCollection {
    return new FakeCollection(this.rows, this.subcollectionsByDoc, this.filters, field);
  }

  /** Test data never approaches a real batch size, so a limit is never actually reached. */
  limit(): FakeCollection {
    return this;
  }

  get(): Promise<{ docs: DocumentSnapshot[], empty: boolean }> {
    const docs = this.matching().map(([id, data]) => snapshot(id, data, this.doc(id)));

    return Promise.resolve({ docs, empty: docs.length === 0 });
  }

  count(): { get(): Promise<{ data(): { count: number } }> } {
    return { get: () => Promise.resolve({ data: () => ({ count: this.matching().length }) }) };
  }

  doc(id?: string): FakeDoc {
    const docId = id ?? `auto-${++autoId}`;
    let subcollections = this.subcollectionsByDoc.get(docId);

    if (!subcollections) {
      subcollections = new Map();
      this.subcollectionsByDoc.set(docId, subcollections);
    }

    return new FakeDoc(docId, this.rows, subcollections);
  }

  private matching(): [string, Row][] {
    let entries = Array.from(this.rows.entries()).filter(([, data]) => this.filters.every(([field, op, value]) => matchesFilter(data[field], op, value)));

    if (this.order) {
      const field = this.order;

      entries = [...entries].sort(([, a], [, b]) => Number(a[field]) - Number(b[field]));
    }

    return entries;
  }
}

/** One document within `FakeCollection` — the operations the two repositories call, including opening a subcollection. */
class FakeDoc {
  constructor(readonly id: string, private readonly rows: Map<string, Row>, private readonly subcollections: DocSubcollections) {}

  /** What a batch or a transaction addresses — this same document. */
  get ref(): FakeDoc {
    return this;
  }

  get(): Promise<DocumentSnapshot> {
    return Promise.resolve(snapshot(this.id, this.rows.get(this.id), this));
  }

  set(data: Row): Promise<void> {
    this.rows.set(this.id, { ...data });

    return Promise.resolve();
  }

  update(fields: Row): Promise<void> {
    this.rows.set(this.id, { ...(this.rows.get(this.id) ?? {}), ...fields });

    return Promise.resolve();
  }

  delete(): Promise<void> {
    this.rows.delete(this.id);

    return Promise.resolve();
  }

  /** This document's own subcollection, opened by name — an item's `contents`, or a job's `tasks`. */
  collection(name: string): FakeCollection {
    let rows = this.subcollections.get(name);

    if (!rows) {
      rows = new Map();
      this.subcollections.set(name, rows);
    }

    return new FakeCollection(rows);
  }
}

function matchesFilter(actual: unknown, op: string, value: unknown): boolean {
  if (op === '==') return actual === value;
  if (op === 'in') return Array.isArray(value) && value.includes(actual);
  if (op === '<=') return actual !== undefined && (actual as string) <= (value as string);

  throw new Error(`FakeCollection does not support \`${op}\``);
}

function snapshot(id: string, data: Row | undefined, ref: unknown): DocumentSnapshot {
  return { id, data: () => (data ? { ...data } : undefined), ref } as unknown as DocumentSnapshot;
}

/** A batch that applies its writes on `commit`, in the order they were queued — good enough for tests that never race one. */
function fakeBatch() {
  const ops: (() => void)[] = [];

  return {
    set: (ref: FakeDoc, data: Row) => ops.push(() => { void ref.set(data); }),
    update: (ref: FakeDoc, data: Row) => ops.push(() => { void ref.update(data); }),
    delete: (ref: FakeDoc) => ops.push(() => { void ref.delete(); }),
    commit: () => { ops.forEach((op) => op()); return Promise.resolve(); },
  };
}

/** No isolation, no rollback — every write a manager makes here is already applied by the time it reads it back. */
function fakeTransaction() {
  return { get: (ref: FakeDoc) => ref.get(), update: (ref: FakeDoc, data: Row) => { void ref.update(data); } };
}

/** The real repositories, over a Firestore that lives only in memory. */
function fakeFirebase(items: LibraryItem[], contents: Record<string, LibraryContent[]>, jobs: ScrapingJob[], tasks: Record<string, ScrapingTask[]>): FirebaseAdminService {
  const collections = new Map<string, FakeCollection>([
    [LIBRARY_COLLECTION, FakeCollection.seeded(items as unknown as Row[], CONTENT_SUBCOLLECTION, contents as unknown as Record<string, Row[]>)],
    [SCRAPING_JOB_COLLECTION, FakeCollection.seeded(jobs as unknown as Row[], TASK_SUBCOLLECTION, tasks as unknown as Record<string, Row[]>)],
  ]);

  const firestore = {
    collection: (name: string) => collections.get(name)!,
    batch: fakeBatch,
    runTransaction: <T>(callback: (transaction: ReturnType<typeof fakeTransaction>) => Promise<T>) => callback(fakeTransaction()),
  } as unknown as Firestore;

  return { firestore } as unknown as FirebaseAdminService;
}

/** What the scraping service answers, recorded rather than asserted on directly. */
class FakeScrapingProvider {
  novel: ScrapedNovel = SCRAPED_NOVEL;

  chapterList: ScrapedChapter[] = SCRAPED_CHAPTERS;

  coverImage: ScrapedCover | null = null;

  readonly calls: string[] = [];

  metadata(crawler: string): Promise<ScrapedNovel> {
    this.calls.push(`metadata ${crawler}`);

    return Promise.resolve(this.novel);
  }

  chapters(crawler: string): Promise<ScrapedChapter[]> {
    this.calls.push(`chapters ${crawler}`);

    return Promise.resolve(this.chapterList);
  }

  cover(crawler: string): Promise<ScrapedCover | null> {
    this.calls.push(`cover ${crawler}`);

    return Promise.resolve(this.coverImage);
  }
}

/** What the manager needs of the cache: a read and a write, kept in memory. */
class FakeCacheProvider {
  readonly store = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.store.get(key) as T | undefined) ?? null);
  }

  set<T>(key: string, _type: CacheType, value: T): Promise<void> {
    this.store.set(key, value);

    return Promise.resolve();
  }
}

/** What a job publish sends, recorded rather than actually queued. */
class FakeQueueProducer {
  readonly sent: { topic: QueueTopic; payload: unknown }[] = [];

  readonly sentMany: { topic: QueueTopic; payloads: unknown[] }[] = [];

  send(topic: QueueTopic, payload: unknown): Promise<void> {
    this.sent.push({ topic, payload });

    return Promise.resolve();
  }

  sendMany(topic: QueueTopic, payloads: unknown[]): Promise<void> {
    this.sentMany.push({ topic, payloads });

    return Promise.resolve();
  }
}

/** The live tree, recorded rather than written — nothing here reaches the Realtime Database. */
class FakeRealtimeProvider {
  readonly jobs: unknown[] = [];

  readonly tasks: unknown[] = [];

  publishJob(job: unknown): Promise<void> {
    this.jobs.push(job);

    return Promise.resolve();
  }

  publishTasks(_jobId: string, rows: unknown[]): Promise<void> {
    this.tasks.push(...rows);

    return Promise.resolve();
  }

  publishTask(): Promise<void> {
    return Promise.resolve();
  }

  clearJob(): Promise<void> {
    return Promise.resolve();
  }

  runningJobs(): Promise<Record<string, string>> {
    return Promise.resolve({});
  }
}

const SCRAPED_NOVEL: ScrapedNovel = {
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
};

const SCRAPED_CHAPTERS: ScrapedChapter[] = [
  { index: 1, title: '第1章：雨中少女', url: CHAPTER_URL },
  { index: 2, title: '第2章：山雨欲來', url: 'https://www.novel543.com/0413553971/8096_528.html' },
];

/** The controller, over the real managers and repositories, over the fakes above. */
function controllerOver(options: { items?: LibraryItem[], contents?: Record<string, LibraryContent[]>, jobs?: ScrapingJob[], tasks?: Record<string, ScrapingTask[]> } = {}) {
  const firebase = fakeFirebase(options.items ?? [], options.contents ?? {}, options.jobs ?? [], options.tasks ?? {});

  const libraryItemManager = new LibraryItemManager(new LibraryRepository(firebase));
  const libraryContentManager = new LibraryContentManager(new LibraryRepository(firebase));
  const scrapingRepository = new ScrapingRepository(firebase);

  const scrapingProvider = new FakeScrapingProvider();
  const cacheProvider = new FakeCacheProvider();
  const producerProvider = new FakeQueueProducer();
  const realtimeProvider = new FakeRealtimeProvider();
  const blobProvider = { saveText: jest.fn(), discard: jest.fn() };
  const appConfig = { scraping: { cacheTtlDays: 30 } } as unknown as AppConfigService;

  const manager = new ScrapingManager(
    appConfig,
    scrapingProvider as unknown as ScrapingProvider,
    cacheProvider as unknown as CacheProvider,
    producerProvider as unknown as QueueProducer,
    blobProvider as unknown as ContentFileProvider,
    realtimeProvider as unknown as RealtimeProvider,
    libraryItemManager,
    libraryContentManager,
    scrapingRepository,
  );

  return { controller: new ScrapingController(manager), scrapingProvider, cacheProvider, producerProvider, realtimeProvider, libraryContentManager };
}

function novel(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    status: LibraryItemStatus.Ready,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: CRAWLER,
    sourceUrl: SOURCE_URL,
    coverUrl: null,
    novelMetadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: 'zh', genres: [], description: '' },
    imageMetadata: null,
    videoMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function chapter(over: Partial<LibraryContent> = {}): LibraryContent {
  return {
    id: 'chapter-1',
    idx: 1,
    type: LibraryContentType.Original,
    status: LibraryContentStatus.Discovered,
    sourceUrl: CHAPTER_URL,
    contentUrl: null,
    language: ContentLanguages.Chinese,
    title: 'Nine Bells for the Harbour',
    words: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as LibraryContent;
}

function job(over: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: 'job-1',
    libraryId: 'novel-1',
    libraryType: LibraryItemType.Novel,
    libraryTitle: 'The Silent Cartographer',
    crawler: CRAWLER,
    status: ScrapingJobStatus.Scheduled,
    range: 'all',
    refetch: false,
    retry: 3,
    startAt: null,
    queuedAt: null,
    completedAt: null,
    total: 1,
    completed: 0,
    failed: 0,
    skipped: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function task(over: Partial<ScrapingTask> = {}): ScrapingTask {
  return {
    id: 'chapter-1',
    contentId: 'chapter-1',
    libraryId: 'novel-1',
    index: 1,
    sourceUrl: CHAPTER_URL,
    status: ScrapingJobStatus.Scheduled,
    refetch: false,
    retry: 3,
    startAt: null,
    completedAt: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function preview(over: Partial<PreviewRequestDto> = {}): PreviewRequestDto {
  return { crawler: CRAWLER, sourceUrl: SOURCE_URL, refresh: false, ...over };
}

function createJobBody(over: Partial<CreateScrapingJobDto> = {}): CreateScrapingJobDto {
  return { libraryId: 'novel-1', range: 'all', refetch: false, startAt: null, retry: 3, ...over };
}

function query(over: Partial<QueryListScrapingJobsDto> = {}): QueryListScrapingJobsDto {
  return { page: 1, pageSize: 20, ...over };
}

describe('ScrapingController.preview', () => {
  it('answers with what the source holds, mapped into our words', async () => {
    const { controller } = controllerOver();

    const answer = await controller.preview(preview());

    expect(answer).toMatchObject({
      type: LibraryItemType.Novel,
      novelContent: { metadata: { title: SCRAPED_NOVEL.title, chapters: SCRAPED_CHAPTERS.length, status: NovelStatus.Ongoing }, coverBinary: null },
    });
  });

  it('caches the answer, and a second call for the same source does not read it again', async () => {
    const { controller, scrapingProvider } = controllerOver();

    await controller.preview(preview());
    await controller.preview(preview());

    expect(scrapingProvider.calls.filter((call) => call.startsWith('metadata'))).toHaveLength(1);
  });

  it('reads the source again when told to refresh', async () => {
    const { controller, scrapingProvider } = controllerOver();

    await controller.preview(preview());
    await controller.preview(preview({ refresh: true }));

    expect(scrapingProvider.calls.filter((call) => call.startsWith('metadata'))).toHaveLength(2);
  });

  it('refuses a name no crawler answers to', async () => {
    const { controller } = controllerOver();

    await expect(controller.preview(preview({ crawler: 'wuxiaworld' }))).rejects.toThrow(NotFoundException);
  });

  it("refuses a URL on someone else's site", async () => {
    const { controller } = controllerOver();

    await expect(controller.preview(preview({ sourceUrl: 'https://www.wuxiaworld.com/novel/whatever' }))).rejects.toThrow(BadRequestException);
  });
});

describe('ScrapingController.discover', () => {
  it("appends what the source holds and our store does not, to the item's content", async () => {
    const { controller, libraryContentManager } = controllerOver({ items: [novel()] });

    await controller.discover({ libraryId: 'novel-1' });

    const page = await libraryContentManager.list('novel-1', { page: 1, pageSize: 50 });
    expect(page.items.map((row) => row.sourceUrl)).toEqual(SCRAPED_CHAPTERS.map((found) => found.url));
  });

  it('refuses a manual item, which has no source to read', async () => {
    const { controller } = controllerOver({ items: [novel({ sourceMode: LibrarySourceMode.Manual, sourceName: 'Manual', sourceUrl: null })] });

    await expect(controller.discover({ libraryId: 'novel-1' })).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an item that is not there', async () => {
    const { controller } = controllerOver();

    await expect(controller.discover({ libraryId: 'missing' })).rejects.toThrow(NotFoundException);
  });

  it('is a 404 for a crawler its `sourceName` does not name', async () => {
    const { controller } = controllerOver({ items: [novel({ sourceName: 'nowhere' })] });

    await expect(controller.discover({ libraryId: 'novel-1' })).rejects.toThrow(NotFoundException);
  });
});

describe('ScrapingController.listJobs', () => {
  const rows = [
    job({ id: 'a', status: ScrapingJobStatus.Completed, createdAt: '2026-08-10T00:00:00.000Z' }),
    job({ id: 'b', status: ScrapingJobStatus.Queued, createdAt: '2026-08-12T00:00:00.000Z' }),
    job({ id: 'c', status: ScrapingJobStatus.Scheduled, createdAt: '2026-08-11T00:00:00.000Z' }),
  ];

  it('answers newest first', async () => {
    const { controller } = controllerOver({ jobs: rows });

    const page = await controller.listJobs(query());

    expect(page.items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it("narrows by the screen's tab", async () => {
    const { controller } = controllerOver({ jobs: rows });

    const page = await controller.listJobs(query({ state: ScrapingJobState.History }));

    expect(page.items.map((item) => item.id)).toEqual(['a']);
  });

  it('carries each job\'s own tasks', async () => {
    const { controller } = controllerOver({ jobs: [job({ id: 'a' })], tasks: { a: [task()] } });

    const page = await controller.listJobs(query());

    expect(page.items[0].tasks.map((row) => row.id)).toEqual(['chapter-1']);
  });

  it('counts what matches, not what the page holds', async () => {
    const { controller } = controllerOver({ jobs: rows });

    const page = await controller.listJobs(query({ pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });
});

describe('ScrapingController.createJob', () => {
  it('records a job over the range asked for, and publishes it', async () => {
    const { controller, producerProvider } = controllerOver({ items: [novel()], contents: { 'novel-1': [chapter()] } });

    const created = await controller.createJob(createJobBody());

    expect(created).toMatchObject({ libraryId: 'novel-1', crawler: CRAWLER, status: ScrapingJobStatus.Queued, total: 1 });
    expect(created.tasks.map((task_) => task_.contentId)).toEqual(['chapter-1']);
    expect(producerProvider.sent).toEqual([{ topic: QueueTopic.ScrapingJobRequested, payload: { jobId: created.id } }]);
  });

  it('leaves a booked job scheduled, and sends nothing', async () => {
    const { controller, producerProvider } = controllerOver({ items: [novel()], contents: { 'novel-1': [chapter()] } });
    const startAt = new Date(Date.now() + 3_600_000).toISOString();

    const created = await controller.createJob(createJobBody({ startAt }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Scheduled, startAt });
    expect(producerProvider.sent).toEqual([]);
  });

  it('records a range that matched nothing as a completed job', async () => {
    const { controller } = controllerOver({ items: [novel()], contents: { 'novel-1': [chapter()] } });

    const created = await controller.createJob(createJobBody({ range: '99' }));

    expect(created).toMatchObject({ status: ScrapingJobStatus.Completed, total: 0, skipped: 0 });
  });

  it('refuses a manual item', async () => {
    const { controller } = controllerOver({ items: [novel({ sourceMode: LibrarySourceMode.Manual, sourceName: 'Manual', sourceUrl: null })] });

    await expect(controller.createJob(createJobBody())).rejects.toThrow(BadRequestException);
  });

  it('refuses a set, which has no chapter to fetch', async () => {
    const { controller } = controllerOver({ items: [novel({ type: LibraryItemType.Image, imageMetadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 }, novelMetadata: null })] });

    await expect(controller.createJob(createJobBody())).rejects.toThrow(NotImplementedException);
  });

  it('refuses a range that will not parse', async () => {
    const { controller } = controllerOver({ items: [novel()] });

    await expect(controller.createJob(createJobBody({ range: 'nonsense' }))).rejects.toThrow(BadRequestException);
  });

  it('refuses a start time that has passed', async () => {
    const { controller } = controllerOver({ items: [novel()] });

    await expect(controller.createJob(createJobBody({ startAt: '2020-01-01T00:00:00.000Z' }))).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an item that is not there', async () => {
    const { controller } = controllerOver();

    await expect(controller.createJob(createJobBody({ libraryId: 'missing' }))).rejects.toThrow(NotFoundException);
  });
});

describe('ScrapingController.deleteJob', () => {
  it('deletes a settled job', async () => {
    const { controller } = controllerOver({ jobs: [job({ status: ScrapingJobStatus.Completed })] });

    await expect(controller.deleteJob('job-1')).resolves.toBeUndefined();
  });

  it('refuses a job that has not settled', async () => {
    const { controller } = controllerOver({ jobs: [job({ status: ScrapingJobStatus.Running })] });

    await expect(controller.deleteJob('job-1')).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for a job that is not there', async () => {
    const { controller } = controllerOver();

    await expect(controller.deleteJob('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('ScrapingController.updateJobStatus', () => {
  function statusBody(status: ScrapingJobStatus): UpdateScrapingJobStatusDto {
    return { status };
  }

  it('publishes a booked job when asked to queue it', async () => {
    const { controller, producerProvider } = controllerOver({
      items: [novel()],
      contents: { 'novel-1': [chapter()] },
      jobs: [job({ status: ScrapingJobStatus.Scheduled })],
      tasks: { 'job-1': [task()] },
    });

    const updated = await controller.updateJobStatus('job-1', statusBody(ScrapingJobStatus.Queued));

    expect(updated.status).toBe(ScrapingJobStatus.Queued);
    expect(producerProvider.sentMany).toHaveLength(1);
    expect(producerProvider.sentMany[0].topic).toBe(QueueTopic.ScrapingContentRequested);
    expect((producerProvider.sentMany[0].payloads as { contentId: string }[]).map((payload) => payload.contentId)).toEqual(['chapter-1']);
  });

  it('pauses a running job, without touching the queue', async () => {
    const { controller, producerProvider } = controllerOver({ jobs: [job({ status: ScrapingJobStatus.Running })], tasks: { 'job-1': [task({ status: ScrapingJobStatus.Queued })] } });

    const updated = await controller.updateJobStatus('job-1', statusBody(ScrapingJobStatus.Paused));

    expect(updated.status).toBe(ScrapingJobStatus.Paused);
    expect(producerProvider.sentMany).toEqual([]);
  });

  it('refuses a status this job cannot reach from where it stands', async () => {
    const { controller } = controllerOver({ jobs: [job({ status: ScrapingJobStatus.Running })] });

    await expect(controller.updateJobStatus('job-1', statusBody(ScrapingJobStatus.Queued))).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for a job that is not there', async () => {
    const { controller } = controllerOver();

    await expect(controller.updateJobStatus('missing', statusBody(ScrapingJobStatus.Stopped))).rejects.toThrow(NotFoundException);
  });
});
