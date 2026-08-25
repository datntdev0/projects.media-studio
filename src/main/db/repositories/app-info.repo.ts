import type { Db } from '../client';
import type { AppInfo, UpsertAppInfoInput } from '../../../shared/app-info';

interface AppInfoRow {
  app_name: string;
  app_version: string;
  install_id: string;
  created_at: number;
  updated_at: number;
}

function toAppInfo(row: AppInfoRow): AppInfo {
  return {
    appName: row.app_name,
    appVersion: row.app_version,
    installId: row.install_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppInfo(db: Db): AppInfo | undefined {
  const row = db.prepare('SELECT * FROM app_info LIMIT 1').get() as AppInfoRow | undefined;
  return row ? toAppInfo(row) : undefined;
}

export function upsertAppInfo(db: Db, input: UpsertAppInfoInput): AppInfo {
  const now = Date.now();
  const createdAt = getAppInfo(db)?.createdAt ?? now;

  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM app_info').run();
    db.prepare(
      `INSERT INTO app_info (app_name, app_version, install_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(input.appName, input.appVersion, input.installId, createdAt, now);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getAppInfo(db)!;
}
