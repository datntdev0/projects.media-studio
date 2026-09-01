import { EventEmitter } from 'node:events';
import { logger } from '@/main/helpers/logger';

export interface QueueMessage<T = unknown> {
  queue: string;
  payload: T;
  publishedAt: number;
}

export type QueueHandler<T = unknown> = (message: QueueMessage<T>) => void | Promise<void>;

export interface SubscribeOptions {
  /** How many messages this subscriber may work at once. The rest wait in order. */
  concurrency: number;
}

export interface MessageBus {
  publish<T>(queue: string, payload: T): void;
  subscribe<T>(queue: string, handler: QueueHandler<T>, options: SubscribeOptions): void;
}

/**
 * In-process pub/sub over Node's EventEmitter — no external broker, since
 * everything runs inside the single Electron main process. Nothing is durable:
 * a message published but not yet worked is lost if the app closes, so a
 * subscriber's work must be safe to request again.
 *
 * Each subscription gets its own FIFO and runs at most `concurrency` handlers at
 * a time, so a slow async handler queues its next message instead of racing it.
 */
export function createMessageBus(): MessageBus {
  const emitter = new EventEmitter();

  const worker = <T>(queue: string, handler: QueueHandler<T>, concurrency: number): QueueHandler<T> => {
    const waiting: QueueMessage<T>[] = [];
    let working = 0;

    const failed = (error: unknown): void => logger.error(`[queue] ${queue} failed to handle a message`, error);

    const pump = (): void => {
      while (working < concurrency && waiting.length > 0) {
        const message = waiting.shift()!;
        working += 1;

        try {
          const working_on = handler(message);
          // A synchronous handler is already finished here; an async one holds the
          // slot until it settles, which is what keeps the queue serialized.
          if (working_on instanceof Promise) {
            void working_on.catch(failed).finally(() => {
              working -= 1;
              pump();
            });
            continue;
          }
        } catch (error: unknown) {
          failed(error);
        }

        working -= 1;
      }
    };

    return (message) => {
      waiting.push(message);
      pump();
    };
  };

  return {
    publish: (queue, payload) => {
      emitter.emit(queue, { queue, payload, publishedAt: Date.now() } satisfies QueueMessage);
    },
    subscribe: (queue, handler, options) => {
      emitter.on(queue, worker(queue, handler, options.concurrency) as QueueHandler);
    },
  };
}
