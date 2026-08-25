import { closeDb, getDb, type Db } from './db/client';
import { createAppInfoManager, type AppInfoManager } from './managers/app-info.manager';

export interface Managers {
  appInfo: AppInfoManager;
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
  };

  container = { db, manager };
  return container;
}

export function closeContainer(): void {
  closeDb();
  container = undefined;
}
