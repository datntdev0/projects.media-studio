import type { Job } from 'node-schedule';
import { closeDb, getDb, type Db } from './database/client';
import { createAppInfoManager, type AppInfoManager } from './managers/app-info.manager';
import { createAppLibraryManager, type AppLibraryManager } from './managers/app-library.manager';
import { createAppScrapingManager, type AppScrapingManager } from './managers/app-scraping.manager';
import { createAppLibraryContentManager, type AppLibraryContentManager } from './managers/app-library-content.manager';
import { createAppWorkflowManager, type AppWorkflowManager } from './managers/app-workflow.manager';
import { createAppWorkflowActivityManager, type AppWorkflowActivityManager } from './managers/app-workflow-activity.manager';
import { createMessageBus, type MessageBus } from './queue/message-bus';

export interface Managers {
  appInfo: AppInfoManager;
  appLibrary: AppLibraryManager;
  appScraping: AppScrapingManager;
  appLibraryContent: AppLibraryContentManager;
  appWorkflow: AppWorkflowManager;
  appWorkflowActivity: AppWorkflowActivityManager;
}

/**
 * Composition root: the single place where concrete repos/managers are
 * wired up. Consumers (IPC handlers, windows, ...) depend on this
 * interface instead of reaching for `getDb()` or repo functions directly,
 * so swapping an implementation (e.g. for tests) only touches this file.
 */
export interface Container {
  db: Db;
  bus: MessageBus;
  manager: Managers;
  scheduledJobs: Job[];
}

let container: Container | undefined;

export function createContainer(): Container {
  const db = getDb();

  const bus = createMessageBus();

  const manager: Managers = {
    appInfo: createAppInfoManager(db),
    appLibrary: createAppLibraryManager(db),
    appScraping: createAppScrapingManager(db, bus),
    appLibraryContent: createAppLibraryContentManager(db),
    appWorkflow: createAppWorkflowManager(db, bus),
    appWorkflowActivity: createAppWorkflowActivityManager(db),
  };

  container = { db, manager, bus, scheduledJobs: [] };
  return container;
}

export function closeContainer(): void {
  container?.scheduledJobs.forEach((job) => job.cancel());
  closeDb();
  container = undefined;
}
