import { Processor } from '@nestjs/bullmq';
import { QueueMessage, SCRAPING_JOB_QUEUE, ScrapingJobRequested } from '../core/queues/queue.messages';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { ScrapingJob, ScrapingJobStatus } from './entities/scraping-job.entity';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobRepository } from './scraping-job.repository';

/** One job at a time: each message is a whole novel's worth of writes and sends. */
const PUBLISH_CONCURRENCY = 1;

/**
 * A job's fan-out, done where nobody is waiting for it.
 *
 * `create` writes the record and its tasks and says so in one message; this is what
 * that message means — every unfinished task moved to `queued`, one scrape message per
 * task, and the live tree brought up to date so the screens see it happen.
 *
 * The record is the authority, as it is for a chapter: a job stopped between the send
 * and the delivery is one this leaves alone rather than publishing work nobody wants.
 */
@Processor(SCRAPING_JOB_QUEUE, { concurrency: PUBLISH_CONCURRENCY })
export class ScrapingJobPublishConsumer extends QueueConsumer<ScrapingJobRequested> {
  constructor(
    private readonly scrapingJobManager: ScrapingJobManager,
    private readonly scrapingJobRepository: ScrapingJobRepository
  ) {
    super();
  }

  protected async handle({ payload }: QueueMessage<ScrapingJobRequested>): Promise<void> {
    const job = await this.scrapingJobRepository.findById(payload.jobId);

    if (!this.validate(payload, job)) return;

    await this.scrapingJobManager.publishScrapingTaskMessages(job!);
  }

  private validate(payload: ScrapingJobRequested, job: ScrapingJob | null): boolean {
    if (!job) {
      this.logger.warn(`Job ${payload.jobId} is gone — nothing of it will be published`);
      return false;
    }

    if (job.status !== ScrapingJobStatus.Queued) {
      this.logger.debug(`Job ${payload.jobId} is ${job.status} — skipped`);
      return false;
    }
    return true;
  }
}
