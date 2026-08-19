// The manager this consumer injects reaches the Admin SDK, where `firebase-admin/auth`
// pulls in an ESM-only dependency Jest cannot require. Nothing here talks to Firebase.
jest.mock('firebase-admin/auth', () => ({}));

import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScrapingContentRequested, QueueMessage, QueueTopic } from '../core/queues/queue.messages';
import { LibraryContent, LibraryContentStatus } from '../library/entities/library-content.entity';
import { LibraryItemType } from '../library/entities/library-item.entity';
import { LibraryContentManager } from '../library/library-content.manager';
import { ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';
import { ScrapingContentConsumer } from './scraping-content.handler';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobRepository } from './scraping-job.repository';

const NOW = '2026-08-14T00:00:00.000Z';

const PAYLOAD: ScrapingContentRequested = {
  jobId: 'job-1',
  itemId: 'novel-1',
  contentId: 'chapter-1',
  crawler: 'novel543',
  sourceUrl: 'https://www.novel543.com/0413553971/8096_527.html',
  refetch: false,
  retry: 3,
};

const ERROR = new Error('The scraping service is not answering. Try again in a moment.');

/** Longer than every backoff in one run put together, so one advance covers them all. */
const WHOLE_RUN_MS = 60_000;

function content(): LibraryContent {
  return {
    id: 'chapter-1',
    type: LibraryItemType.Novel,
    index: 1,
    title: 'Nine Bells for the Harbour',
    language: 'zh',
    words: 0,
    sourceUrl: PAYLOAD.sourceUrl,
    contentUrl: null,
    status: LibraryContentStatus.Pending,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function task(status = ScrapingJobStatus.Queued): ScrapingTask {
  return {
    id: 'chapter-1',
    contentId: 'chapter-1',
    libraryId: 'novel-1',
    index: 1,
    sourceUrl: PAYLOAD.sourceUrl,
    status,
    refetch: false,
    retry: 3,
    startAt: null,
    completedAt: null,
    error: null,
  };
}

/**
 * The consumer owns the record writes, so the doubles it is given are what the
 * assertions read: the manager is only asked to fetch and to settle.
 */
function fixture(options: { content?: LibraryContent | null, task?: ScrapingTask | null } = {}) {
  const jobs = { scrape: jest.fn().mockResolvedValue(undefined), settleJob: jest.fn().mockResolvedValue(undefined) };
  const repository = {
    task: jest.fn().mockResolvedValue(options.task === undefined ? task() : options.task),
    startTask: jest.fn().mockResolvedValue(undefined),
    completeTask: jest.fn().mockResolvedValue(undefined),
    patchTask: jest.fn().mockResolvedValue(undefined),
  };
  const contents = {
    find: jest.fn().mockResolvedValue(options.content === undefined ? content() : options.content),
    markScraping: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { publishTask: jest.fn().mockResolvedValue(undefined), publishJob: jest.fn().mockResolvedValue(undefined) };

  const consumer = new ScrapingContentConsumer(
    jobs as unknown as ScrapingJobManager,
    repository as unknown as ScrapingJobRepository,
    contents as unknown as LibraryContentManager,
    realtime as unknown as RealtimeProvider,
  );

  return { consumer, jobs, repository, contents, realtime };
}

/** Only what the base class reads. `retry` travels in the payload, not in the job's options. */
function job(retry = 3): Job<QueueMessage<ScrapingContentRequested>> {
  const message: QueueMessage<ScrapingContentRequested> = { topic: QueueTopic.ScrapingContentRequested, payload: { ...PAYLOAD, retry }, sentAt: NOW };

  return { data: message, attemptsMade: 0 } as Job<QueueMessage<ScrapingContentRequested>>;
}

describe('ScrapingContentConsumer', () => {
  beforeEach(() => {
    // The backoff is waited out inside the run, so the run is driven by the clock here.
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('hands the payload and the row to the manager', async () => {
    const { consumer, jobs } = fixture();

    await consumer.process(job());

    expect(jobs.scrape).toHaveBeenCalledWith({ ...PAYLOAD, retry: 3 }, content());
  });

  it('moves its task through running and into completed, and settles the job', async () => {
    const { consumer, jobs, repository, contents, realtime } = fixture();

    await consumer.process(job());

    expect(contents.markScraping).toHaveBeenCalledWith('novel-1', ['chapter-1']);
    expect(repository.startTask).toHaveBeenCalledWith('job-1', 'chapter-1', expect.any(String));
    expect(repository.completeTask).toHaveBeenCalledWith('job-1', 'chapter-1', expect.any(String));
    expect(realtime.publishTask).toHaveBeenNthCalledWith(1, 'job-1', 'chapter-1', ScrapingJobStatus.Running);
    expect(realtime.publishTask).toHaveBeenNthCalledWith(2, 'job-1', 'chapter-1', ScrapingJobStatus.Completed);
    expect(jobs.settleJob).toHaveBeenCalledWith('job-1');
  });

  it('starts the task before it reads the source, so the job reads as running while it fetches', async () => {
    const { consumer, jobs, repository } = fixture();

    await consumer.process(job());

    expect(repository.startTask.mock.invocationCallOrder[0]).toBeLessThan(jobs.scrape.mock.invocationCallOrder[0]);
  });

  it('tries again within the same run, without going back to the queue', async () => {
    const { consumer, jobs, repository } = fixture();

    jobs.scrape.mockRejectedValueOnce(ERROR);

    const run = consumer.process(job());

    await jest.advanceTimersByTimeAsync(WHOLE_RUN_MS);
    await run;

    expect(jobs.scrape).toHaveBeenCalledTimes(2);
    expect(repository.completeTask).toHaveBeenCalledTimes(1);
    expect(repository.patchTask).not.toHaveBeenCalled();
  });

  it('takes the first attempt and every retry the job asked for before it gives up', async () => {
    const { consumer, jobs, repository, contents } = fixture();

    jobs.scrape.mockRejectedValue(ERROR);

    const run = expect(consumer.process(job())).rejects.toThrow(ERROR);

    await jest.advanceTimersByTimeAsync(WHOLE_RUN_MS);
    await run;

    // Three retries is four attempts: `retry` counts the ones that follow a failure.
    expect(jobs.scrape).toHaveBeenCalledTimes(4);
    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', ['chapter-1']);
    expect(repository.patchTask).toHaveBeenCalledWith('job-1', 'chapter-1', { status: ScrapingJobStatus.Failed, error: ERROR.message });
  });

  it('still takes one attempt where the caller asked for no retries', async () => {
    const { consumer, jobs, repository } = fixture();

    jobs.scrape.mockRejectedValue(ERROR);

    await expect(consumer.process(job(0))).rejects.toThrow(ERROR);

    expect(jobs.scrape).toHaveBeenCalledTimes(1);
    expect(repository.patchTask).toHaveBeenCalledWith('job-1', 'chapter-1', { status: ScrapingJobStatus.Failed, error: ERROR.message });
  });

  it('skips a task the record no longer wants, whatever the queue still holds', async () => {
    const { consumer, jobs, repository } = fixture({ task: task(ScrapingJobStatus.Paused) });

    await expect(consumer.process(job())).resolves.toBeUndefined();

    expect(jobs.scrape).not.toHaveBeenCalled();
    expect(repository.startTask).not.toHaveBeenCalled();
  });

  it('is quiet about a task deleted between the send and the delivery', async () => {
    const { consumer, jobs } = fixture({ task: null });

    await expect(consumer.process(job())).resolves.toBeUndefined();

    expect(jobs.scrape).not.toHaveBeenCalled();
    expect(jobs.settleJob).not.toHaveBeenCalled();
  });

  it('fails the task where the library row is gone, so the job can still drain', async () => {
    const { consumer, jobs, repository, contents } = fixture({ content: null });

    await expect(consumer.process(job())).resolves.toBeUndefined();

    expect(jobs.scrape).not.toHaveBeenCalled();
    expect(contents.markFailed).toHaveBeenCalledWith('novel-1', ['chapter-1']);
    expect(repository.patchTask).toHaveBeenCalledWith('job-1', 'chapter-1', { status: ScrapingJobStatus.Failed, error: 'The library row is gone' });
    expect(jobs.settleJob).toHaveBeenCalledWith('job-1');
  });
});
