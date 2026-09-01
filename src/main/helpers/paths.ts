import { app } from 'electron';
import path from 'node:path';
import { config } from './config';

/**
 * Portable-style storage root: the directory next to wherever the app is
 * actually running from (the executable's directory once packaged, the
 * project root in dev) rather than the OS-specific per-user profile
 * directory (`app.getPath('userData')`), further offset by `appDir` from
 * config.json when set. Subsystems (db, logs, ...) each get their own
 * folder under this root. `APP_DATA_DIR` overrides this outright, so e2e
 * runs get an isolated, disposable data dir per test.
 */
export function getAppBaseDir(): string {
  if (process.env.APP_DATA_DIR) return process.env.APP_DATA_DIR;
  const root = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  return path.join(root, config.appDir);
}

/** The `data` root every stored asset hangs off — covers, and the per-item chapter files. */
export function getAppDataDir(): string {
  return path.join(getAppBaseDir(), 'data');
}

/** Where scraped binary assets (e.g. cover images) are cached on disk, keyed by file name. */
export function getAppCoverDir(): string {
  return path.join(getAppDataDir(), 'covers');
}

/** Custom scheme the renderer loads cover images through — a raw file path is not a URL a browser will load. */
export const COVER_PROTOCOL = 'app-cover';
