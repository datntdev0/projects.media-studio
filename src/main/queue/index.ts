import type { Container } from '../container';
import { registerScrapingJobHandler } from './handlers/app-scraping-job.handler';
import { registerAppWorkflowHandler } from './handlers/app-workflow.handler';

export function registerQueueHandlers(container: Container): void {
  registerScrapingJobHandler(container);
  registerAppWorkflowHandler(container);
}
