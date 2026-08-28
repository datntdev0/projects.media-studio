import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate';
import type { Db } from './client';

/** A fresh in-memory database with every migration applied — for repository/manager tests that should exercise real SQL rather than a mocked repository. */
export function createTestDb(): Db {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}
