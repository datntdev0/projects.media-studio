import type { Job } from 'node-schedule';
import { closeDb, getDb, type Db } from './database/client';
import { createAppInfoManager, type AppInfoManager } from './managers/app-info.manager';
import { createMessageBus, type MessageBus } from './queue/message-bus';

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
  bus: MessageBus;
  manager: Managers;
  scheduledJobs: Job[];
}

let container: Container | undefined;

export function createContainer(): Container {
  const db = getDb();

  const manager: Managers = {
    appInfo: createAppInfoManager(db),
  };

  const bus = createMessageBus();

  container = { db, manager, bus, scheduledJobs: [] };
  return container;
}

export function closeContainer(): void {
  container?.scheduledJobs.forEach((job) => job.cancel());
  closeDb();
  container = undefined;
}
