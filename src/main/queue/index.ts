import type { Container } from '../container';
import { registerAppPingHandler } from './handlers/app-ping.handler';
import { registerScrapingJobHandler } from './handlers/app-scraping-job.handler';

export function registerQueueHandlers(container: Container): void {
  registerAppPingHandler(container.bus);
  registerScrapingJobHandler(container);
}
