import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

/**
 * The work a schedule carries out. No arguments and no result: whatever it needs
 * is closed over by the caller, and by the time it runs there is nobody left to
 * hand a result to.
 */
export type ScheduledTask = () => Promise<void>;

/**
 * Work booked for a wall-clock time, once.
 *
 * The `@Cron` decorator cannot express this — its expression is a recurrence
 * fixed at build time, and these times are not known until something asks. So a
 * `CronJob` is built per request and given a `Date`, which fires it once and
 * stops, and it is handed to `SchedulerRegistry` so the app can still see and
 * cancel it by name.
 *
 * In memory, and only that: nothing survives a restart, and in a second instance
 * the same name is a second job. Anything that has to outlive the process needs
 * a record of its own to be rescheduled from at boot — this holds the timer, not
 * the intent.
 *
 * The name is a handle rather than a claim. Booking one that is already taken
 * replaces it, so a caller that reschedules does not have to cancel first, and a
 * caller that repeats itself ends up with one job rather than a duplicate.
 */
@Injectable()
export class ScheduleProvider {
  private readonly logger = new Logger(ScheduleProvider.name);

  constructor(private readonly scheduler: SchedulerRegistry) {}

  /**
   * Books `task` for `runAt`. Throws on a time that is unusable or already gone,
   * rather than never running: the caller is the only one who can still do
   * something about it, and the underlying job would throw on a past date anyway.
   */
  runAt(name: string, runAt: Date, task: ScheduledTask): void {
    if (Number.isNaN(runAt.getTime())) {
      throw new Error(`Cannot schedule "${name}": that is not a usable date.`);
    }

    if (runAt.getTime() <= Date.now()) {
      throw new Error(`Cannot schedule "${name}" for ${runAt.toISOString()}: that time has passed.`);
    }

    this.cancel(name);

    const job = CronJob.from({ cronTime: runAt, onTick: () => void this.run(name, task) });

    this.scheduler.addCronJob(name, job);
    // Jobs added at runtime start when told to, not when added.
    job.start();

    this.logger.log(`"${name}" is scheduled for ${runAt.toISOString()}.`);
  }

  /** Drops the booking. `false` if there was none — cancelling twice is not a failure. */
  cancel(name: string): boolean {
    if (!this.isScheduled(name)) {
      return false;
    }

    // Stops the timer as well as forgetting the name.
    this.scheduler.deleteCronJob(name);

    return true;
  }

  /** Whether that name is still waiting to run. */
  isScheduled(name: string): boolean {
    return this.scheduler.doesExist('cron', name);
  }

  /**
   * Runs the task, and swallows what it throws.
   *
   * Nothing is awaiting this, so a rejection left alone would be an unhandled one
   * — which in Node is the whole process. The booking is dropped before the work
   * starts: it is spent either way, and the name should be free again for a task
   * that reschedules itself.
   */
  private async run(name: string, task: ScheduledTask): Promise<void> {
    this.cancel(name);

    try {
      await task();
      this.logger.log(`"${name}" ran.`);
    } catch (cause: unknown) {
      this.logger.error(`"${name}" failed`, cause);
    }
  }
}
