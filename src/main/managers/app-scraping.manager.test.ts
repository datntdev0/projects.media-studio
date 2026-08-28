import { beforeEach, describe, expect, it } from 'vitest';
import { createAppScrapingManager } from './app-scraping.manager';
import { createTestDb } from '../database/test-db';
import { seedLibrary } from '../database/test-fixtures';
import { createMessageBus, type MessageBus } from '../queue/message-bus';
import { QUEUE_NAMES } from '../queue/queue-names';
import { createAppLibraryContent } from '../database/repositories/app-library-content.repo';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import { getScrapingJob, updateScrapingJob } from '../database/repositories/app-scraping-job.repo';
import type { Db } from '../database/client';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage } from '../../shared/app-library-content';
import { AppLibraryStatus, AppLibraryType, LibrarySourceMode } from '../../shared/app-library';
import { ScrapingJobState, ScrapingJobStatus } from '../../shared/app-scraping';

let db: Db;
let bus: MessageBus;

function seedCrawlerNovel(overrides: Partial<{ status: AppLibraryStatus }> = {}): string {
  return seedLibrary(db, AppLibraryType.Novel, { sourceMode: LibrarySourceMode.Crawler, sourceName: 'novel543', sourceUrl: 'https://www.novel543.com/n/1', ...overrides }).id;
}

function seedChapter(libraryId: string, idx: number, status: AppLibraryContentStatus, sourceUrl = `https://www.novel543.com/c/${idx}`): void {
  createAppLibraryContent(db, libraryId, { idx, type: AppLibraryContentType.Original, status, sourceUrl, textContent: { contentUrl: null, body: '', language: ContentLanguage.Chinese, title: `Chapter ${idx}` } });
}

beforeEach(() => {
  db = createTestDb();
  bus = createMessageBus();
});

describe('app scraping manager — createJob', () => {
  it('throws for a library item that does not exist', () => {
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.createJob({ libraryId: 'missing', range: 'all' })).toThrow(/not found/);
  });

  it('throws for a non-novel item', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Image).id;
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.createJob({ libraryId, range: 'all' })).toThrow(/not fetched from a source/);
  });

  it('throws for a manually-sourced item', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel).id;
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.createJob({ libraryId, range: 'all' })).toThrow(/has no source to scrape/);
  });

  it('throws for an unknown crawler', () => {
    const libraryId = seedLibrary(db, AppLibraryType.Novel, { sourceMode: LibrarySourceMode.Crawler, sourceName: 'unknown-site', sourceUrl: 'https://example.com' }).id;
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.createJob({ libraryId, range: 'all' })).toThrow(/Unknown crawler/);
  });

  it('throws for a startAt not in the future', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.createJob({ libraryId, range: 'all', startAt: Date.now() - 1000 })).toThrow(/not a time in the future/);
  });

  it('creates a completed, empty job when the range matches no chapter', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);

    const job = manager.createJob({ libraryId, range: 'all' });

    expect(job).toMatchObject({ status: ScrapingJobStatus.Completed, total: 0, crawler: 'novel543' });
  });

  it('queues a job immediately and publishes a scraping-job-requested message', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);
    const received: unknown[] = [];
    bus.subscribe(QUEUE_NAMES.scrapingJobRequested, (message) => received.push(message.payload));

    const job = manager.createJob({ libraryId, range: 'all' });

    expect(job.status).toBe(ScrapingJobStatus.Queued);
    expect(job.total).toBe(1);
    expect(received).toEqual([{ jobId: job.id }]);
  });

  it('schedules a job for the future without publishing', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);
    const received: unknown[] = [];
    bus.subscribe(QUEUE_NAMES.scrapingJobRequested, (message) => received.push(message.payload));

    const job = manager.createJob({ libraryId, range: 'all', startAt: Date.now() + 60_000 });

    expect(job.status).toBe(ScrapingJobStatus.Scheduled);
    expect(received).toEqual([]);
  });

  it('"missing" range skips already-completed chapters unless refetch is set', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Completed);
    seedChapter(libraryId, 2, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);

    const job = manager.createJob({ libraryId, range: 'all' });
    expect(job.total).toBe(1);
    expect(job.skipped).toBe(1);

    const refetchJob = manager.createJob({ libraryId, range: 'all', refetch: true });
    expect(refetchJob.total).toBe(2);
    expect(refetchJob.skipped).toBe(0);
  });

  it('an index expression range selects only the matching chapters', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    seedChapter(libraryId, 2, AppLibraryContentStatus.Pending);
    seedChapter(libraryId, 3, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);

    const job = manager.createJob({ libraryId, range: '1,3' });

    expect(job.tasks.map((task) => task.index)).toEqual([1, 3]);
  });
});

describe('app scraping manager — listJobs/removeJob', () => {
  it('listJobs() filters by state, newest first', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    const empty = manager.createJob({ libraryId, range: 'all' });
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    const queued = manager.createJob({ libraryId, range: '1' });
    // Force distinct `created_at` — both jobs can otherwise land in the same millisecond, making sort order among ties unreliable.
    db.prepare('UPDATE scraping_jobs SET created_at = ? WHERE id = ?').run(1, empty.id);
    db.prepare('UPDATE scraping_jobs SET created_at = ? WHERE id = ?').run(2, queued.id);

    expect(manager.listJobs().map((job) => job.id)).toEqual([queued.id, empty.id]);
    expect(manager.listJobs({ state: ScrapingJobState.History }).map((job) => job.id)).toEqual([empty.id]);
    expect(manager.listJobs({ state: ScrapingJobState.Active }).map((job) => job.id)).toEqual([queued.id]);
  });

  it('listJobs() filters by libraryId', () => {
    const libraryA = seedCrawlerNovel();
    const libraryB = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    const jobA = manager.createJob({ libraryId: libraryA, range: 'all' });
    manager.createJob({ libraryId: libraryB, range: 'all' });

    expect(manager.listJobs({ libraryId: libraryA }).map((job) => job.id)).toEqual([jobA.id]);
  });

  it('removeJob() throws for a job that does not exist', () => {
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.removeJob('missing')).toThrow(/No scraping job/);
  });

  it('removeJob() throws for a job that has not settled', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' });

    expect(() => manager.removeJob(job.id)).toThrow(/cannot be deleted/);
  });

  it('removeJob() deletes a settled job', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' });

    manager.removeJob(job.id);

    expect(getScrapingJob(db, job.id)).toBeUndefined();
  });
});

describe('app scraping manager — updateJobStatus', () => {
  it('throws for a status a caller may not request directly', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' });
    expect(() => manager.updateJobStatus(job.id, ScrapingJobStatus.Running)).toThrow(/cannot be asked for/);
  });

  it('throws for a job that does not exist', () => {
    const manager = createAppScrapingManager(db, bus);
    expect(() => manager.updateJobStatus('missing', ScrapingJobStatus.Paused)).toThrow(/No scraping job/);
  });

  it('throws for a transition the job cannot reach from its current status', () => {
    const libraryId = seedCrawlerNovel();
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' }); // completed, empty job
    expect(() => manager.updateJobStatus(job.id, ScrapingJobStatus.Paused)).toThrow(/cannot be asked for/);
  });

  it('moves a paused job back to queued and re-publishes the request', () => {
    const libraryId = seedCrawlerNovel();
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' });
    updateScrapingJob(db, job.id, { ...job, status: ScrapingJobStatus.Paused });
    const received: unknown[] = [];
    bus.subscribe(QUEUE_NAMES.scrapingJobRequested, (message) => received.push(message.payload));

    const resumed = manager.updateJobStatus(job.id, ScrapingJobStatus.Queued);

    expect(resumed.status).toBe(ScrapingJobStatus.Queued);
    expect(resumed.queuedAt).not.toBeNull();
    expect(received).toEqual([{ jobId: job.id }]);
  });

  it('stopping a job halts only its scheduled/queued tasks and settles the library status', () => {
    const libraryId = seedCrawlerNovel({ status: AppLibraryStatus.Scraping });
    seedChapter(libraryId, 1, AppLibraryContentStatus.Pending);
    seedChapter(libraryId, 2, AppLibraryContentStatus.Pending);
    const manager = createAppScrapingManager(db, bus);
    const job = manager.createJob({ libraryId, range: 'all' });
    const runningTasks = job.tasks.map((task, i) => (i === 0 ? { ...task, status: ScrapingJobStatus.Running } : task));
    updateScrapingJob(db, job.id, { ...job, status: ScrapingJobStatus.Running, tasks: runningTasks });

    const stopped = manager.updateJobStatus(job.id, ScrapingJobStatus.Stopped);

    expect(stopped.status).toBe(ScrapingJobStatus.Stopped);
    expect(stopped.tasks[0].status).toBe(ScrapingJobStatus.Running);
    expect(stopped.tasks[1].status).toBe(ScrapingJobStatus.Stopped);
    expect(stopped.completedAt).not.toBeNull();
    expect(getAppLibrary(db, libraryId)!.status).toBe(AppLibraryStatus.Draft);
  });
});
