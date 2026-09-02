import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { Db } from '@/main/database/client';
import { logger } from './logger';
import { buildLibraryPackage } from './library-package';
import { getAppWorkspaceDir } from './paths';
import { LIBRARY_PACKAGE_CHAPTERS_DIR, LIBRARY_PACKAGE_MANIFEST, type LibraryPackageChapter, type LibraryPackageManifest } from '@/shared/app-library-package';
import type { AppWorkspace } from '@/shared/app-workspace';

/** One chapter of the working copy — its manifest entry and the body on disk beside it. */
export interface WorkspaceChapter {
  entry: LibraryPackageChapter;
  body: string;
}

/**
 * Lays the workspace's library item out in its working directory, in the same
 * shape the export package has: `library.json`, `chapters/`, and the cover. The
 * item is re-exported on every execution, so a chapter edited since the last run
 * is picked up — stale chapter files are cleared first, and what the steps
 * themselves have written (`extractions/`) is left alone.
 */
export function prepareWorkspaceDir(db: Db, workspace: AppWorkspace): string {
  const dir = getAppWorkspaceDir(workspace.name);
  const { data } = buildLibraryPackage(db, workspace.libraryId);

  fs.rmSync(path.join(dir, LIBRARY_PACKAGE_CHAPTERS_DIR), { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  new AdmZip(data).extractAllTo(dir, true);

  logger.info(`[workspace] working directory ready at ${dir}`);
  return dir;
}

/** The working copy's `library.json`, or undefined when the workspace has never been executed. */
export function readWorkspaceManifest(workspaceName: string): LibraryPackageManifest | undefined {
  const file = path.join(getAppWorkspaceDir(workspaceName), LIBRARY_PACKAGE_MANIFEST);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as LibraryPackageManifest;
}

/** One chapter of the working copy, or undefined when it was never fetched and so carries no body. */
export function readWorkspaceChapter(workspaceName: string, idx: number): WorkspaceChapter | undefined {
  const entry = readWorkspaceManifest(workspaceName)?.chapters.find((chapter) => chapter.idx === idx);
  if (!entry?.file) return undefined;

  const file = path.join(getAppWorkspaceDir(workspaceName), entry.file);
  if (!fs.existsSync(file)) return undefined;

  return { entry, body: fs.readFileSync(file, 'utf8') };
}
