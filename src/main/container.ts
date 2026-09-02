import type { Job } from 'node-schedule';
import { closeDb, getDb, type Db } from './database/client';
import { createAppInfoManager, type AppInfoManager } from './managers/app-info.manager';
import { createAppLibraryManager, type AppLibraryManager } from './managers/app-library.manager';
import { createAppLibraryPackageManager, type AppLibraryPackageManager } from './managers/app-library-package.manager';
import { createAppLibraryContentManager, type AppLibraryContentManager } from './managers/app-library-content.manager';
import { createAppWorkspaceManager, type AppWorkspaceManager } from './managers/app-workspace.manager';
import { createAppWorkspaceRunManager, type AppWorkspaceRunManager } from './managers/app-workspace-run.manager';
import { createAppWorkspaceExtractionManager, type AppWorkspaceExtractionManager } from './managers/app-workspace-extraction.manager';
import { createMessageBus, type MessageBus } from './queue/message-bus';

export interface Managers {
  appInfo: AppInfoManager;
  appLibrary: AppLibraryManager;
  appLibraryPackage: AppLibraryPackageManager;
  appLibraryContent: AppLibraryContentManager;
  appWorkspace: AppWorkspaceManager;
  appWorkspaceRun: AppWorkspaceRunManager;
  appWorkspaceExtraction: AppWorkspaceExtractionManager;
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
    appLibraryPackage: createAppLibraryPackageManager(db),
    appLibraryContent: createAppLibraryContentManager(db),
    appWorkspace: createAppWorkspaceManager(db),
    appWorkspaceRun: createAppWorkspaceRunManager(db, bus),
    appWorkspaceExtraction: createAppWorkspaceExtractionManager(db),
  };

  container = { db, bus, manager, scheduledJobs: [] };
  return container;
}

export function closeContainer(): void {
  for (const job of container?.scheduledJobs ?? []) {
    job.cancel();
  }
  closeDb();
  container = undefined;
}
