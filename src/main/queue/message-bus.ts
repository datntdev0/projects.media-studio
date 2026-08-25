import { EventEmitter } from 'node:events';

export interface QueueMessage<T = unknown> {
  queue: string;
  payload: T;
  publishedAt: number;
}

export type QueueHandler<T = unknown> = (message: QueueMessage<T>) => void;

export interface MessageBus {
  publish<T>(queue: string, payload: T): void;
  subscribe<T>(queue: string, handler: QueueHandler<T>): void;
}

/**
 * In-process pub/sub over Node's EventEmitter — no external broker, since
 * everything runs inside the single Electron main process. Handlers run
 * synchronously on the main thread, so this only suits light, fast work
 * (e.g. heartbeats), not CPU-bound or high-volume message processing.
 */
export function createMessageBus(): MessageBus {
  const emitter = new EventEmitter();

  return {
    publish: (queue, payload) => {
      emitter.emit(queue, { queue, payload, publishedAt: Date.now() } satisfies QueueMessage);
    },
    subscribe: (queue, handler) => {
      emitter.on(queue, handler as QueueHandler);
    },
  };
}
