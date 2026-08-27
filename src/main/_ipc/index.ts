import type { Container } from '../container';
import { registerAppInfoHandlers } from './app-info.handlers';
import { registerAppLibraryHandlers } from './app-library.handlers';
import { registerAppScrapingHandlers } from './app-scraping.handlers';
import { registerAppLibraryContentHandlers } from './app-library-content.handlers';
import { registerAppWorkflowHandlers } from './app-workflow.handlers';
import { registerAppWorkflowActivityHandlers } from './app-workflow-activity.handlers';
import { registerAppWorkflowHistoryHandlers } from './app-workflow-history.handlers';

export function registerIpcHandlers(container: Container): void {
  registerAppInfoHandlers(container);
  registerAppLibraryHandlers(container);
  registerAppScrapingHandlers(container);
  registerAppLibraryContentHandlers(container);
  registerAppWorkflowHandlers(container);
  registerAppWorkflowActivityHandlers(container);
  registerAppWorkflowHistoryHandlers(container);
}
