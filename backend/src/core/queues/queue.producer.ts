import { getQueueToken } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { QUEUE_CONSUMERS, QueueMessage, QueuePayloads, QueueTopic } from './queue.messages';

/**
 * The single producer, and the only way into the queues.
 *
 * A manager sends a topic and is done: it does not name a queue, does not know
 * which consumers read it, and gets nothing back. Adding a consumer changes the
 * registry, never the call.
 *
 * Queues are looked up by token rather than injected, because which ones exist is
 * read from the registry at startup and `@InjectQueue` needs its name at build
 * time. `strict: false` is what finds them — they are registered by `CoreModule`,
 * not by whatever module is producing.
 */
@Injectable()
export class QueueProducer {
  private readonly logger = new Logger(QueueProducer.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Adds one copy of the message to every queue subscribed to the topic.
   *
   * Resolves once each copy is queued, not once any of it is processed — a
   * consumer runs later, in its own time, and its failure is its own.
   *
   * Throws if a queue will not take the message, which leaves the fan-out partial:
   * the copies already accepted stay accepted. Redis being unreachable is the
   * realistic cause, and it is the caller's to decide about — a request that must
   * not half-happen should send after its own write has committed.
   */
  async send<T extends QueueTopic>(topic: T, payload: QueuePayloads[T]): Promise<void> {
    const message: QueueMessage<QueuePayloads[T]> = { topic, payload, sentAt: new Date().toISOString() };
    const consumers = QUEUE_CONSUMERS[topic];

    await Promise.all(consumers.map((queue) => this.queue(queue).add(topic, message)));

    this.logger.debug(`${topic} went to ${consumers.length} consumer(s)`);
  }

  private queue(name: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  }
}
