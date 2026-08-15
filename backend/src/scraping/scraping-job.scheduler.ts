import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScrapingJobManager } from './scraping-job.manager';

/**
 * The clock over the job records.
 *
 * A minute is the resolution the dialog offers — `datetime-local` goes no finer —
 * and it costs one indexed query per tick, so a job booked for 03:00:30 fires at
 * 03:01. This replaces the in-memory timer a booking used to live in: the record
 * survives a restart, and the claim inside `runDue` survives a second instance.
 *
 * Holds no rules of its own. What is due, what may be published and in what order
 * are the manager's; this is when it is asked.
 */
@Injectable()
export class ScrapingJobScheduler {
  private readonly logger = new Logger(ScrapingJobScheduler.name);

  constructor(private readonly jobs: ScrapingJobManager) {}

  /**
   * Nothing awaits a tick, so what one throws is caught here rather than left to
   * become an unhandled rejection — which in Node is the whole process. The next
   * tick runs regardless.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.jobs.runDue();
    } catch (cause: unknown) {
      this.logger.error('The scheduled-job tick failed', cause);
    }
  }
}
