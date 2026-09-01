import type { Container } from '@/main/container';

/** Starts every cron job, keeping the handles on the container so shutdown can cancel them. */
export function startScheduledJobs(_container: Container): void {
  // Jobs are added here as features start needing a clock.
}
