import type { Container } from '../container';
import { registerAppPingHandler } from './handlers/app-ping.handler';

export function registerQueueHandlers({ bus }: Container): void {
  registerAppPingHandler(bus);
}
