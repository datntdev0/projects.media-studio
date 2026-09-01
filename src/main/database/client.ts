import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { getAppBaseDir } from '@/main/helpers/paths';

export type Db = DatabaseSync;

let db: Db | undefined;

/**
 * Opens (or returns the already-open) app-wide SQLite connection — no
 * separate database install or service required. Uses Node's built-in
 * `node:sqlite` — no native addon to compile.
 */
export function getDb(): Db {
  if (db) {
    return db;
  }

  const dataDir = path.join(getAppBaseDir(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  db = new DatabaseSync(path.join(dataDir, 'media-studio.db'));
  db.exec('PRAGMA journal_mode = WAL');

  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
