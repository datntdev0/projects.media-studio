import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

// A chapter's text is written to a real file now (see helpers/content-storage.ts), so point the
// app data dir at a disposable directory per run. Without this, tests would write into — and
// delete from — the project's own `data/` folder alongside whatever the app has stored there.
process.env.APP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'media-studio-test-'));

// `createTestDb()` opens a real `node:sqlite` database, which logs Node's one-time "experimental
// feature" notice per test file — expected here, so it's silenced rather than left to clutter every
// test run's output. Other warnings still print normally.
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning.message;
  if (message.includes('SQLite is an experimental feature')) return;
  (emitWarning as (...a: unknown[]) => void)(warning, ...args);
}) as typeof process.emitWarning;

// Tests run under plain Node, not inside Electron. `runMigrations` (via `getMigrationsDir`),
// `getAppBaseDir`, and `AppInfoManager.init()` are what touch `electron.app` from code paths unit
// tests exercise — so a bare-minimum stand-in is enough.
vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd(), getName: () => 'media-studio', getVersion: () => '0.1.0' },
}));
