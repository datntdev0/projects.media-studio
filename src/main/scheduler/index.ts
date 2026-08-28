import type { Container } from '../container';
import { scheduleScrapingJobsJob } from './jobs/app-scraping-job.job';

export function startScheduledJobs(container: Container): void {
  container.scheduledJobs.push(scheduleScrapingJobsJob(container));
}
