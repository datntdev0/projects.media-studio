import { app } from 'electron';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type Db = DatabaseSync;

let db: Db | undefined;

/**
 * Portable-style storage: a `data/` folder next to wherever the app is
 * actually running from (the executable's directory once packaged, the
 * project root in dev) rather than the OS-specific per-user profile
 * directory (`app.getPath('userData')`).
 */
function getDataDir(): string {
  const baseDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  return path.join(baseDir, 'data');
}

/**
 * Opens (or returns the already-open) app-wide SQLite connection — no
 * separate database install or service required. Uses Node's built-in
 * `node:sqlite` — no native addon to compile.
 */
export function getDb(): Db {
  if (db) {
    return db;
  }

  const dataDir = getDataDir();
  fs.mkdirSync(dataDir, { recursive: true });

  db = new DatabaseSync(path.join(dataDir, 'media-studio.db'));
  db.exec('PRAGMA journal_mode = WAL');

  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
