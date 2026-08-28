import { app } from 'electron';
import path from 'node:path';

/**
 * Portable-style storage root: the directory next to wherever the app is
 * actually running from (the executable's directory once packaged, the
 * project root in dev) rather than the OS-specific per-user profile
 * directory (`app.getPath('userData')`). Subsystems (db, logs, ...) each
 * get their own folder under this root. `APP_DATA_DIR` overrides this,
 * so e2e runs get an isolated, disposable data dir per test.
 */
export function getAppBaseDir(): string {
  if (process.env.APP_DATA_DIR) return process.env.APP_DATA_DIR;
  return app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
}

/** Where scraped binary assets (e.g. cover images) are cached on disk, keyed by file name. */
export function getAppCoverDir(): string {
  return path.join(getAppBaseDir(), 'data', 'covers');
}

/** Where a workflow's one-off export of its library — chapters, cover, manifest — lives on disk, keyed by workflow id. */
export function getAppWorkflowExportDir(workflowId: string): string {
  return path.join(getAppBaseDir(), 'data', 'workflows', workflowId);
}

/** Custom scheme the renderer loads cover images through — a raw file path is not a URL a browser will load. */
export const COVER_PROTOCOL = 'app-cover';
