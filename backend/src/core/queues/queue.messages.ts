/**
 * What a producer announces. A topic is the only thing it names — which consumers
 * run is decided by `QUEUE_CONSUMERS` below, not by the caller.
 *
 * "Topic" rather than a queue name because one of these fans out to several
 * queues. BullMQ has no word for it: a queue there is the thing a single consumer
 * reads, which is one layer below this.
 */
export enum QueueTopic {
  SamplePinged = 'sample.pinged',
}

/** The sample's payload. Stands in for a real one — see `system/sample.handler.ts`. */
export interface SamplePinged {
  note: string;
  sentBy: string;
}

/**
 * The payload each topic carries. Producer and consumer both read this, so a field
 * that changes is a compile error on both sides at once.
 *
 * Ids and primitives only. A domain entity here would make core depend on the
 * feature module that owns it, and would tie a queued message — which outlives the
 * process that wrote it — to a shape free to change under it.
 */
export interface QueuePayloads {
  [QueueTopic.SamplePinged]: SamplePinged;
}

/** What a consumer is handed: the payload, and enough about the send to trace it. */
export interface QueueMessage<TPayload> {
  topic: QueueTopic;
  payload: TPayload;
  /** ISO instant the producer stamped — when it was sent, not when it was picked up. */
  sentAt: string;
}

/**
 * One queue per consumer, named for the topic it serves and the job it does.
 *
 * BullMQ hands a job to exactly one worker, so two parts that must both see a
 * topic need two queues, and the producer sends the same message to each.
 */
export const SAMPLE_AUDIT_QUEUE = 'sample.pinged.audit';

export const SAMPLE_NOTIFY_QUEUE = 'sample.pinged.notify';

/**
 * Which consumers receive what. The one place fan-out is configured: a queue name
 * added here, and a consumer declared for it, is the whole of subscribing —
 * nothing that produces is touched, because nothing that produces knows who reads.
 *
 * A queue may appear under more than one topic, which is how one consumer comes to
 * serve several.
 */
export const QUEUE_CONSUMERS: Record<QueueTopic, readonly string[]> = {
  [QueueTopic.SamplePinged]: [SAMPLE_AUDIT_QUEUE, SAMPLE_NOTIFY_QUEUE],
};

/** Every queue that has to exist, for the module that registers them. Deduplicated. */
export function allConsumerQueues(): string[] {
  return [...new Set(Object.values(QUEUE_CONSUMERS).flat())];
}
