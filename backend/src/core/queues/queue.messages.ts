/**
 * What a producer announces. A topic is the only thing it names — which consumers
 * run is decided by `QUEUE_CONSUMERS` below, not by the caller.
 *
 * "Topic" rather than a queue name because one of these fans out to several
 * queues. BullMQ has no word for it: a queue there is the thing a single consumer
 * reads, which is one layer below this.
 */
export enum QueueTopic {
  ScrapingJobRequested = 'scraping.job.requested',
  ScrapingContentRequested = 'scraping.content.requested',
  LibraryImportRequested = 'library.import.requested',
}

/**
 * A job whose tasks are to be handed to the queue. The fan-out itself — a thousand
 * Firestore writes and a thousand messages — moved off the request that asked for it.
 */
export interface ScrapingJobRequested {
  jobId: string;
}

/**
 * One piece of content to fetch and store. Ids and primitives only — the message
 * outlives the process that wrote it, and the row it names is free to move under it.
 */
export interface ScrapingContentRequested {
  /** Which job asked. The task it names is what decides whether this is still wanted. */
  jobId: string;
  itemId: string;
  contentId: string;
  crawler: string;
  sourceUrl: string;
  refetch: boolean;
  retry: number;
}

/**
 * A package to unpack into an item. One message for the whole of it, not one per
 * chapter: an import is a single sequential pass over one archive we already hold,
 * and splitting it would mean reading that archive once per chapter.
 */
export interface LibraryImportRequested {
  /** Where the chapters are going. Already resolved — a new-item import created it first. */
  itemId: string;
  packageUrl: string;
  /** What to do with a chapter number the target already holds. The library's own enum, as a string. */
  onConflict: string;
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
  [QueueTopic.ScrapingJobRequested]: ScrapingJobRequested;
  [QueueTopic.ScrapingContentRequested]: ScrapingContentRequested;
  [QueueTopic.LibraryImportRequested]: LibraryImportRequested;
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
export const SCRAPING_JOB_QUEUE = 'scraping.job.requested';
export const SCRAPING_CONTENT_QUEUE = 'scraping.content.scrape.requested';
export const LIBRARY_IMPORT_QUEUE = 'library.import.unpack.requested';

/**
 * Which consumers receive what. The one place fan-out is configured: a queue name
 * added here, and a consumer declared for it, is the whole of subscribing —
 * nothing that produces is touched, because nothing that produces knows who reads.
 *
 * A queue may appear under more than one topic, which is how one consumer comes to
 * serve several.
 */
export const QUEUE_CONSUMERS: Record<QueueTopic, readonly string[]> = {
  [QueueTopic.ScrapingJobRequested]: [SCRAPING_JOB_QUEUE],
  [QueueTopic.ScrapingContentRequested]: [SCRAPING_CONTENT_QUEUE],
  [QueueTopic.LibraryImportRequested]: [LIBRARY_IMPORT_QUEUE],
};

/** Every queue that has to exist, for the module that registers them. Deduplicated. */
export function allConsumerQueues(): string[] {
  return [...new Set(Object.values(QUEUE_CONSUMERS).flat())];
}
