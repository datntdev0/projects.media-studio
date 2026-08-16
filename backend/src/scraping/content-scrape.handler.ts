import { Processor } from '@nestjs/bullmq';
import { CONTENT_SCRAPE_QUEUE, ContentScrapeRequested, QueueMessage } from '../core/queues/queue.messages';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { attemptsFor } from './dto/scraping-job.dto';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobRepository } from './scraping-job.repository';
import { ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';
import { LibraryContent } from '../library/entities/library-content.entity';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { nowIso } from '../_shared/helper';
import { LibraryContentManager } from '../library/library-content.manager';

/** The service drives one stealth browser and self-bounds at four tabs. Two is the share this takes. */
const SCRAPE_CONCURRENCY = 2;

/** The first retry's wait. Each further one doubles it. */
const BACKOFF_MS = 2_000;

/**
 * One chapter per message, two at a time.
 *
 * The work itself is the manager's — this class is the queue's end of it: unwrap,
 * delegate, and retry what fails without letting go of the message. A chapter is
 * finished, one way or the other, by the delivery that started it: the queue hands it
 * over once, and both records are written here rather than by a later attempt that
 * would have to find its way back to a task somebody may have paused meanwhile.
 */
@Processor(CONTENT_SCRAPE_QUEUE, { concurrency: SCRAPE_CONCURRENCY })
export class ContentScrapeConsumer extends QueueConsumer<ContentScrapeRequested> {
  constructor(
    private readonly scrapingJobManager: ScrapingJobManager,
    private readonly scrapingJobRepository: ScrapingJobRepository,
    private readonly libraryContentManager: LibraryContentManager,
    private readonly realtimeProvider: RealtimeProvider
  ) {
    super();
  }

  /**
   * Every attempt this chapter is allowed, in one run.
   *
   * Between two of them the task goes back to `queued` — `scrape` gates on it, and a
   * task left `running` by the attempt that just died is one the next attempt skips
   * silently. The last failure marks the task failed and is rethrown, which is how a
   * consumer says the work did not happen and what leaves the message in the failed
   * set. The queue is sent one attempt per message, so nothing is redelivered.
   */
  protected async handle({ payload }: QueueMessage<ContentScrapeRequested>): Promise<void> {
    const attempts = attemptsFor(payload.retry);
    const content = await this.libraryContentManager.find(payload.itemId, payload.contentId);
    const task = await this.scrapingJobRepository.task(payload.jobId, payload.contentId);

    if (!this.validate(payload, content, task)) return;
    await this.markTaskRunning(payload);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.scrapingJobManager.scrape(payload, content!);
        await this.markTaskCompleted(payload);
        return;
      } 
      catch (cause: unknown) {
        const error = cause instanceof Error ? cause.message : String(cause);

        if (attempt === attempts) {
          await this.markTaskFailed(payload, error);
          throw cause;
        }

        this.logger.warn(`${payload.sourceUrl} failed on attempt ${attempt} of ${attempts} — ${error}`);
        await wait(BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  private validate(payload: ContentScrapeRequested, content: LibraryContent | null, task: ScrapingTask | null): boolean {
    if (!content) {
      this.logger.warn(`Content ${payload.contentId} of item ${payload.itemId} is gone — ${payload.sourceUrl} will not be scraped`);
      return false;
    }

    if (!task) {
      this.logger.warn(`Task ${payload.contentId} of job ${payload.jobId} is gone — ${payload.sourceUrl} will not be scraped`);
      return false;
    }

    if (task.status !== ScrapingJobStatus.Queued) {
      this.logger.debug(`Task ${payload.contentId} of job ${payload.jobId} is ${task.status} — skipped`);
      return false;
    }
    return true;
  }

  private async markTaskRunning(payload: ContentScrapeRequested): Promise<void> {
    await this.libraryContentManager.markScraping(payload.itemId, [payload.contentId]);
    await this.scrapingJobRepository.startTask(payload.jobId, payload.contentId, nowIso());
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Running);
    await this.realtimeProvider.publishJob({ id: payload.jobId, status: ScrapingJobStatus.Running });
  }

  private async markTaskCompleted(payload: ContentScrapeRequested): Promise<void> {
    await this.scrapingJobRepository.completeTask(payload.jobId, payload.contentId, nowIso());
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Completed);
  }

  private async markTaskFailed(payload: ContentScrapeRequested, error: string): Promise<void> {
    await this.libraryContentManager.markFailed(payload.itemId, [payload.contentId]);
    await this.scrapingJobRepository.patchTask(payload.jobId, payload.contentId, { status: ScrapingJobStatus.Failed, error });
    await this.realtimeProvider.publishTask(payload.jobId, payload.contentId, ScrapingJobStatus.Failed);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}
