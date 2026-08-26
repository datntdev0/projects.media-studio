import type { Container } from '../container';
import { scheduleAppPingJob } from './jobs/app-ping.job';
import { scheduleScrapingJobsJob } from './jobs/scraping-job.job';

export function startScheduledJobs(container: Container): void {
  container.scheduledJobs.push(scheduleAppPingJob(container.bus));
  container.scheduledJobs.push(scheduleScrapingJobsJob(container));
}
