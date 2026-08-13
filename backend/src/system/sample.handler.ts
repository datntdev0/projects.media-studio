import { Processor } from '@nestjs/bullmq';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { QueueMessage, SAMPLE_AUDIT_QUEUE, SAMPLE_NOTIFY_QUEUE, SamplePinged } from '../core/queues/queue.messages';

/**
 * Two consumers over one topic, which is the whole point of the sample.
 *
 * `SystemManager` produces `sample.pinged` once per boot and both of these run:
 * each on its own queue, each retried on its own schedule, neither able to fail
 * the other or to hold it up. Adding a third is a queue name in `QUEUE_CONSUMERS`
 * and a class here — the producer does not change.
 *
 * Copy the shape rather than the work. Logging a line stands in for whatever the
 * real thing would do, and these two go when a real topic takes the place of this
 * one.
 */

/**
 * How many of its queue's jobs this process takes at once. Per consumer on
 * purpose: what a handler costs is the handler's business, and an audit that only
 * writes a line can run wider than something holding a browser open.
 */
const AUDIT_CONCURRENCY = 5;

const NOTIFY_CONCURRENCY = 1;

@Processor(SAMPLE_AUDIT_QUEUE, { concurrency: AUDIT_CONCURRENCY })
export class SampleAuditConsumer extends QueueConsumer<SamplePinged> {
  /** Not `async`: there is nothing to await, and the base class only wants the promise. */
  protected handle(message: QueueMessage<SamplePinged>): Promise<void> {
    this.logger.log(`Audited "${message.payload.note}" from ${message.payload.sentBy}, sent ${message.sentAt}`);

    return Promise.resolve();
  }
}

@Processor(SAMPLE_NOTIFY_QUEUE, { concurrency: NOTIFY_CONCURRENCY })
export class SampleNotifyConsumer extends QueueConsumer<SamplePinged> {
  protected handle(message: QueueMessage<SamplePinged>): Promise<void> {
    this.logger.log(`Notified about "${message.payload.note}"`);

    return Promise.resolve();
  }
}
