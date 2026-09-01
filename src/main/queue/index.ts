import type { Container } from '@/main/container';

/** Subscribes every queue handler, before anything can publish onto the bus. */
export function registerQueueHandlers(_container: Container): void {
  // Handlers are added here as features start using the queue.
}
