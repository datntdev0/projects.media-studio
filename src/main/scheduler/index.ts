import type { Container } from '../container';
import { scheduleAppPingJob } from './jobs/app-ping.job';

export function startScheduledJobs(container: Container): void {
  container.scheduledJobs.push(scheduleAppPingJob(container.bus));
}
