import schedule, { type Job } from 'node-schedule';
import { createLogger } from '../../helpers/logger';
import type { Container } from '../../container';
import { ScrapingJobState, ScrapingJobStatus } from '../../../shared/app-scraping';

const logger = createLogger('scraping-job-scheduler');

/** The clock over booked jobs — a minute's resolution is plenty for a start time given to the minute. */
export function scheduleScrapingJobsJob(container: Container): Job {
  return schedule.scheduleJob('* * * * *', () => {
    const due = container.manager.appScraping
      .listJobs({ state: ScrapingJobState.Scheduled })
      .filter((job) => job.startAt !== null && job.startAt <= Date.now());

    for (const job of due) {
      try {
        container.manager.appScraping.updateJobStatus(job.id, ScrapingJobStatus.Queued);
      } catch (error) {
        logger.error(`Could not start scheduled job ${job.id}`, error);
      }
    }
  });
}
