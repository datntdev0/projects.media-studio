import schedule, { type Job } from 'node-schedule';
import type { MessageBus } from '../../queue/message-bus';
import { QUEUE_NAMES } from '../../queue/queue-names';

export function scheduleAppPingJob(bus: MessageBus): Job {
  return schedule.scheduleJob('* * * * *', () => {
    bus.publish(QUEUE_NAMES.appPing, { source: 'app-ping.job' });
  });
}
