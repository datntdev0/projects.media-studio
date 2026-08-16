// The manager this consumer injects reaches the Admin SDK, where `firebase-admin/auth`
// pulls in an ESM-only dependency Jest cannot require. Nothing here talks to Firebase.
jest.mock('firebase-admin/auth', () => ({}));

import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContentScrapeRequested, QueueMessage, QueueTopic } from '../core/queues/queue.messages';
import { ContentScrapeConsumer } from './content-scrape.handler';
import { ScrapingJobManager } from './scraping-job.manager';

const PAYLOAD: ContentScrapeRequested = {
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

function fixture() {
  const jobs = { scrape: jest.fn().mockResolvedValue(undefined), retry: jest.fn().mockResolvedValue(undefined), fail: jest.fn().mockResolvedValue(undefined) };

  return { consumer: new ContentScrapeConsumer(jobs as unknown as ScrapingJobManager), jobs };
}

/** Only what the base class reads. `retry` travels in the payload, not in the job's options. */
function job(retry = 3): Job<QueueMessage<ContentScrapeRequested>> {
  const message: QueueMessage<ContentScrapeRequested> = { topic: QueueTopic.ContentScrapeRequested, payload: { ...PAYLOAD, retry }, sentAt: '2026-08-14T00:00:00.000Z' };

  return { data: message, attemptsMade: 0 } as Job<QueueMessage<ContentScrapeRequested>>;
}

describe('ContentScrapeConsumer', () => {
  beforeEach(() => {
    // The backoff is waited out inside the run, so the run is driven by the clock here.
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('hands the payload to the manager', async () => {
    const { consumer, jobs } = fixture();

    await consumer.process(job());

    expect(jobs.scrape).toHaveBeenCalledWith({ ...PAYLOAD, retry: 3 });
    expect(jobs.retry).not.toHaveBeenCalled();
  });

  it('tries again within the same run, without going back to the queue', async () => {
    const { consumer, jobs } = fixture();

    jobs.scrape.mockRejectedValueOnce(ERROR);

    const run = consumer.process(job());

    await jest.advanceTimersByTimeAsync(WHOLE_RUN_MS);
    await run;

    // The task goes back to `queued` first: `scrape` gates on it, and the attempt that
    // just died left it `running`, which the next one would skip without throwing.
    expect(jobs.retry).toHaveBeenCalledWith({ ...PAYLOAD, retry: 3 }, ERROR.message);
    expect(jobs.scrape).toHaveBeenCalledTimes(2);
    expect(jobs.fail).not.toHaveBeenCalled();
  });

  it('takes every attempt the job asked for before it gives up', async () => {
    const { consumer, jobs } = fixture();

    jobs.scrape.mockRejectedValue(ERROR);

    const run = expect(consumer.process(job())).rejects.toThrow(ERROR);

    await jest.advanceTimersByTimeAsync(WHOLE_RUN_MS);
    await run;

    expect(jobs.scrape).toHaveBeenCalledTimes(4);
    expect(jobs.retry).toHaveBeenCalledTimes(3);
    expect(jobs.fail).toHaveBeenCalledWith({ ...PAYLOAD, retry: 3 }, ERROR.message);
  });

  it('fails on the first failure where the caller asked for no retries', async () => {
    const { consumer, jobs } = fixture();

    jobs.scrape.mockRejectedValue(ERROR);

    await expect(consumer.process(job(0))).rejects.toThrow(ERROR);

    expect(jobs.scrape).toHaveBeenCalledTimes(1);
    expect(jobs.retry).not.toHaveBeenCalled();
    expect(jobs.fail).toHaveBeenCalledWith({ ...PAYLOAD, retry: 0 }, ERROR.message);
  });
});
