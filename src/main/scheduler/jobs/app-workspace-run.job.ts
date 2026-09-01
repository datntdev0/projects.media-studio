import schedule, { type Job } from 'node-schedule';
import { logger } from '@/main/helpers/logger';
import type { Container } from '@/main/container';

/**
 * The heartbeat over unfinished runs — a minute's resolution is plenty for a start
 * time given to the minute. It decides nothing itself: it hands every active run to
 * the orchestrator, which works out what is due. That also picks runs back up after
 * a restart, since the queue holds nothing durable.
 */
export function scheduleWorkspaceRunsJob(container: Container): Job {
  return schedule.scheduleJob('* * * * *', () => {
    try {
      container.manager.appWorkspaceRun.dispatchActive();
    } catch (error) {
      logger.error('[scheduler] Could not hand the active runs to the orchestrator', error);
    }
  });
}
