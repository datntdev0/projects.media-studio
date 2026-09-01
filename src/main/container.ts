import { closeDb, getDb, type Db } from './database/client';
import { createAppInfoManager, type AppInfoManager } from './managers/app-info.manager';
import { createAppLibraryManager, type AppLibraryManager } from './managers/app-library.manager';
import { createAppLibraryPackageManager, type AppLibraryPackageManager } from './managers/app-library-package.manager';
import { createAppLibraryContentManager, type AppLibraryContentManager } from './managers/app-library-content.manager';

export interface Managers {
  appInfo: AppInfoManager;
  appLibrary: AppLibraryManager;
  appLibraryPackage: AppLibraryPackageManager;
  appLibraryContent: AppLibraryContentManager;
}

/**
 * Composition root: the single place where concrete repos/managers are
 * wired up. Consumers (IPC handlers, windows, ...) depend on this
 * interface instead of reaching for `getDb()` or repo functions directly,
 * so swapping an implementation (e.g. for tests) only touches this file.
 */
export interface Container {
  db: Db;
  manager: Managers;
}

let container: Container | undefined;

export function createContainer(): Container {
  const db = getDb();

  const manager: Managers = {
    appInfo: createAppInfoManager(db),
    appLibrary: createAppLibraryManager(db),
    appLibraryPackage: createAppLibraryPackageManager(db),
    appLibraryContent: createAppLibraryContentManager(db),
  };

  container = { db, manager };
  return container;
}

export function closeContainer(): void {
  closeDb();
  container = undefined;
}
