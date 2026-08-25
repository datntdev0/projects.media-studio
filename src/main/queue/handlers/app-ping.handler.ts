import { createLogger } from '../../helpers/logger';
import type { MessageBus } from '../message-bus';
import { QUEUE_NAMES } from '../queue-names';

const logger = createLogger('app-ping');

export function registerAppPingHandler(bus: MessageBus): void {
  bus.subscribe(QUEUE_NAMES.appPing, (message) => {
    logger.info(`ping received (published at ${new Date(message.publishedAt).toISOString()})`);
  });
}
