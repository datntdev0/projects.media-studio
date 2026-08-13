import { WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueMessage } from './queue.messages';

/**
 * What every consumer is: a worker over one queue, and a handler for what it finds
 * there.
 *
 * A subclass adds `@Processor(queueName)` — the decorator binds the class to its
 * queue and cannot be inherited — and implements `handle`. Unwrapping the envelope
 * and reporting a failure is the same for all of them, so it is here.
 *
 * Throwing out of `handle` is how a consumer says the work did not happen: BullMQ
 * retries on the schedule `defaultJobOptions` sets and, once the attempts are
 * spent, leaves the job in the failed set. Swallowing would mark it done.
 */
export abstract class QueueConsumer<TPayload> extends WorkerHost {
  protected readonly logger = new Logger(this.constructor.name);

  /** BullMQ's entry point. The envelope is opened here, so `handle` never sees a job. */
  async process(job: Job<QueueMessage<TPayload>>): Promise<void> {
    try {
      await this.handle(job.data);
    } catch (cause: unknown) {
      // Logged here rather than left to the retry, because by the time BullMQ
      // gives up the reason each attempt failed is gone.
      this.logger.error(`${job.data.topic} failed on attempt ${job.attemptsMade + 1}`, cause);

      throw cause;
    }
  }

  /** The message handler: the work itself. */
  protected abstract handle(message: QueueMessage<TPayload>): Promise<void>;
}
