import { app } from 'electron';
import path from 'node:path';
import { config } from './config';
import { fileSlug } from './file-name';

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

/**
 * A workspace's own working directory: the library item it runs over, laid out
 * exactly as the export package is, plus whatever its steps derive from it. Keyed
 * by the workspace's name rather than its id, so the folder is recognisable on
 * disk — two workspaces whose names normalize alike therefore share one.
 */
export function getAppWorkspaceDir(workspaceName: string): string {
  return path.join(getAppBaseDir(), 'workspaces', fileSlug(workspaceName, 'workspace'));
}

/** Where the Semantic Analysis step writes its per-chapter extractions and the world bible merged from them. */
export function getAppWorkspaceExtractionDir(workspaceName: string): string {
  return path.join(getAppWorkspaceDir(workspaceName), 'extractions');
}

/** Custom scheme the renderer loads cover images through — a raw file path is not a URL a browser will load. */
export const COVER_PROTOCOL = 'app-cover';
