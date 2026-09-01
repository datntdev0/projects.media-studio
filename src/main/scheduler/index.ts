import type { Container } from '@/main/container';
import { scheduleWorkspaceRunsJob } from './jobs/app-workspace-run.job';

/** Starts every cron job, keeping the handles on the container so shutdown can cancel them. */
export function startScheduledJobs(container: Container): void {
  container.scheduledJobs.push(scheduleWorkspaceRunsJob(container));
}
