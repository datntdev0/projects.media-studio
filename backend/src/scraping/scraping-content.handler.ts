import { Processor } from '@nestjs/bullmq';
import { SCRAPING_CONTENT_QUEUE, ScrapingContentRequested, QueueMessage } from '../core/queues/queue.messages';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { ScrapingRepository } from './scraping.repository';
import { ScrapingManager } from './scraping.manager';
import { ScrapingJobStatus } from './entities/scraping-job.entity';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { nowIso } from '../_shared/helper';
import { LibraryContentManager } from '../library/library-content.manager';

/** The service drives one stealth browser and self-bounds at four tabs. Two is the share this takes. */
const SCRAPE_CONCURRENCY = 2;

/** The first retry's wait. Each further one doubles it. */
const BACKOFF_MS = 1_000;

/**
 * One chapter per message, two at a time.
 *
 * The work itself is the manager's — this class is the queue's end of it: unwrap,
 * delegate, and retry what fails without letting go of the message. A chapter is
 * finished, one way or the other, by the delivery that started it: the queue hands it
 * over once, and both records are written here rather than by a later attempt that
 * would have to find its way back to a task somebody may have paused meanwhile.
 */
@Processor(SCRAPING_CONTENT_QUEUE, { concurrency: SCRAPE_CONCURRENCY })
export class ScrapingContentConsumer extends QueueConsumer<ScrapingContentRequested> {
  constructor(
    private readonly scrapingManager: ScrapingManager,
    private readonly scrapingRepository: ScrapingRepository,
    private readonly libraryContentManager: LibraryContentManager,
    private readonly realtimeProvider: RealtimeProvider
  ) {
    super();
  }

  /**
   * Every attempt this chapter is allowed, in one run.
   *
   * The last failure marks the task failed and is rethrown, which is how a consumer says
   * the work did not happen and what leaves the message in the failed set. The queue is
   * sent one attempt per message, so nothing is redelivered.
   */
  protected async handle({ payload }: QueueMessage<ScrapingContentRequested>): Promise<void> {
    const content = await this.libraryContentManager.find(payload.itemId, payload.contentId);
    const task = await this.scrapingRepository.getTask(payload.jobId, payload.contentId);

    if (!task) {
      this.logger.warn(`Task ${payload.contentId} of job ${payload.jobId} is gone — ${payload.sourceUrl} will not be scraped`);
      return;
    }

    if (task.status !== ScrapingJobStatus.Queued) {
      this.logger.debug(`Task ${payload.contentId} of job ${payload.jobId} is ${task.status} — skipped`);
      return;
    }

    // Failed rather than skipped: a task left queued is one the job stays owed forever.
    if (!content) {
      this.logger.warn(`Content ${payload.contentId} of item ${payload.itemId} is gone — ${payload.sourceUrl} will not be scraped`);
      await this.markTaskFailed(payload, 'The library row is gone');
      await this.scrapingManager.settleJob(payload.jobId);
      return;
    }

    await this.markTaskRunning(payload);

    // `retry` counts the retries, so the attempt that earns them is not one of them.
    for (let attempt = 0; attempt <= payload.retry; attempt += 1) {
      try {
        await this.scrapingManager.scrape(payload, content);
        await this.markTaskCompleted(payload);
        await this.scrapingManager.settleJob(payload.jobId);
        this.logger.debug(`Scraped ${payload.sourceUrl} of ${payload.itemId}`);
        return;
      } catch (cause: unknown) {
        const error = cause instanceof Error ? cause.message : String(cause);
        this.logger.warn(`${payload.sourceUrl} failed on attempt ${attempt + 1} of ${payload.retry + 1} — ${error}`);

        if (attempt === payload.retry) {
          await this.markTaskFailed(payload, error);
          await this.scrapingManager.settleJob(payload.jobId);
          throw cause;
        }

        await wait(BACKOFF_MS * 2 ** attempt);
      }
    }
  }

  private async markTaskRunning(payload: ScrapingContentRequested): Promise<void> {
    await this.libraryContentManager.markScraping(payload.itemId, [payload.contentId]);
    await this.scrapingRepository.startTask(payload.jobId, payload.contentId, nowIso());
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Running);
    await this.realtimeProvider.publishJob({ id: payload.jobId, status: ScrapingJobStatus.Running });
  }

  private async markTaskCompleted(payload: ScrapingContentRequested): Promise<void> {
    await this.scrapingRepository.completeTask(payload.jobId, payload.contentId, nowIso());
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Completed);
  }

  private async markTaskFailed(payload: ScrapingContentRequested, error: string): Promise<void> {
    await this.libraryContentManager.markFailed(payload.itemId, [payload.contentId]);
    await this.scrapingRepository.patchTask(payload.jobId, payload.contentId, { status: ScrapingJobStatus.Failed, error });
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Failed);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
