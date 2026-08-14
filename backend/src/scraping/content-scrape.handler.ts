import { OnWorkerEvent, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CONTENT_SCRAPE_QUEUE, ContentScrapeRequested, QueueMessage } from '../core/queues/queue.messages';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { ScrapingJobManager } from './scraping-job.manager';

/** The service drives one stealth browser and self-bounds at four tabs. Two is the share this takes. */
const SCRAPE_CONCURRENCY = 2;

/**
 * One chapter per message, two at a time.
 *
 * The work itself is the manager's — this class is the queue's end of it: unwrap,
 * delegate, and turn the last throw into a red badge. Throwing out of `handle` stays
 * how a consumer says *not done*, and every throw before the last one is a retry
 * BullMQ has already booked.
 */
@Processor(CONTENT_SCRAPE_QUEUE, { concurrency: SCRAPE_CONCURRENCY })
export class ContentScrapeConsumer extends QueueConsumer<ContentScrapeRequested> {
  constructor(private readonly jobs: ScrapingJobManager) {
    super();
  }

  protected handle(message: QueueMessage<ContentScrapeRequested>): Promise<void> {
    return this.jobs.scrape(message.payload);
  }

  /**
   * The last failure, and only the last: an earlier one still has an attempt left,
   * and a row marked failed between two attempts would contradict the retry.
   *
   * Not awaited by anything — BullMQ's events are fire-and-forget — so what the write
   * throws is logged here rather than left to become an unhandled rejection.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<QueueMessage<ContentScrapeRequested>>): void {
    if (job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }

    const { payload } = job.data;

    this.jobs
      .fail(payload)
      .then(() => this.logger.warn(`${payload.sourceUrl} failed after ${job.attemptsMade} attempt(s)`))
      .catch((cause: unknown) => this.logger.error(`Could not mark content ${payload.contentId} failed`, cause));
  }
}
