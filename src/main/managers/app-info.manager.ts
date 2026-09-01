import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import type { Db } from '@/main/database/client';
import { getAppInfo, upsertAppInfo } from '@/main/database/repositories/app-info.repo';
import type { AppInfo } from '@/shared/app-info';

export interface AppInfoManager {
  get(): AppInfo | undefined;
  init(): AppInfo;
}

export function createAppInfoManager(db: Db): AppInfoManager {
  return {
    get: () => getAppInfo(db),

    // Preserve the install id across restarts; only generate one the first
    // time this app has ever run on this machine.
    init: () => {
      const installId = getAppInfo(db)?.installId ?? randomUUID();
      return upsertAppInfo(db, {
        appName: app.getName(),
        appVersion: app.getVersion(),
        installId,
      });
    },
  };
}
