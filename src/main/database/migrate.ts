import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './client';

interface MigrationFile {
  version: string;
  description: string;
  fileName: string;
  sql: string;
}

// V<major>.<minor>.<patch>__<description>.sql — Flyway's naming convention.
const MIGRATION_FILE_PATTERN = /^V(\d+\.\d+\.\d+)__(.+)\.sql$/;
const BOOTSTRAP_VERSION = '0.0.0';

// Marks the boundary between statements in a migration file, so a file can
// hold more than one CREATE/ALTER without relying on node:sqlite to split
// them itself.
const STATEMENT_SEPARATOR = '<---split-statement--->';

function getMigrationsDir(): string {
  // Plain SQL files aren't bundled into main.js by Vite — they're shipped
  // as a packaged extraResource instead (see forge.config.ts) and read
  // straight off disk here.
  return app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(app.getAppPath(), 'src/main/database/migrations');
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  return aParts[0] - bParts[0] || aParts[1] - bParts[1] || aParts[2] - bParts[2];
}

function loadMigrationFiles(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir)
    .map((fileName): MigrationFile | undefined => {
      const match = MIGRATION_FILE_PATTERN.exec(fileName);
      if (!match) {
        return undefined;
      }
      const [, version, description] = match;
      return { version, description, fileName, sql: fs.readFileSync(path.join(dir, fileName), 'utf8') };
    })
    .filter((file): file is MigrationFile => file !== undefined)
    .sort((a, b) => compareVersions(a.version, b.version));
}

function recordMigration(db: Db, migration: MigrationFile): void {
  db.prepare(
    'INSERT OR IGNORE INTO _database_history (version, description, applied_at) VALUES (?, ?, ?)',
  ).run(migration.version, migration.description, Date.now());
}

function runAndRecord(db: Db, migration: MigrationFile): void {
  db.exec('BEGIN');
  try {
    for (const statement of migration.sql.split(STATEMENT_SEPARATOR)) {
      const trimmed = statement.trim();
      if (trimmed) {
        db.exec(trimmed);
      }
    }
    recordMigration(db, migration);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getAppliedVersions(db: Db): Set<string> {
  const rows = db.prepare('SELECT version FROM _database_history').all() as { version: string }[];
  return new Set(rows.map((row) => row.version));
}

/**
 * Flyway-style migration runner. SQL files live under `database/migrations/` named
 * `V<major>.<minor>.<patch>__<description>.sql`.
 *
 * `V0.0.0__database_history.sql` bootstraps the `_database_history` ledger
 * table and always runs first, unconditionally — its DDL is a
 * `CREATE TABLE IF NOT EXISTS`, so re-running it is a no-op. Only once that
 * table is guaranteed to exist can we query which versions have already
 * been applied and work out what's pending.
 */
export function runMigrations(db: Db): void {
  const dir = getMigrationsDir();
  const files = loadMigrationFiles(dir);

  const bootstrap = files.find((file) => file.version === BOOTSTRAP_VERSION);
  if (!bootstrap) {
    throw new Error(`Missing bootstrap migration V${BOOTSTRAP_VERSION}__*.sql in ${dir}`);
  }

  runAndRecord(db, bootstrap);

  const appliedVersions = getAppliedVersions(db);
  const pending = files.filter(
    (file) => file.version !== BOOTSTRAP_VERSION && !appliedVersions.has(file.version),
  );

  for (const migration of pending) {
    runAndRecord(db, migration);
  }
}
