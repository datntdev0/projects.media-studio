import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { config } from './config';
import { LIBRARY_PACKAGE_CHAPTERS_DIR, LIBRARY_PACKAGE_MANIFEST, type LibraryPackageChapter, type LibraryPackageManifest } from '@/shared/app-library-package';

/** The path characters Windows reserves — none of them may reach a file name. */
const RESERVED_FILENAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/** Everything below this code point is a C0 control character, which is no more welcome in a file name. */
const LAST_CONTROL_CODE_POINT = 0x1f;

/** Long titles exist; file systems still cap a name. Leaves room for a prefix and an extension. */
const MAX_SLUG_LENGTH = 80;

function isNameSafe(char: string): boolean {
  return !RESERVED_FILENAME_CHARS.has(char) && (char.codePointAt(0) ?? 0) > LAST_CONTROL_CODE_POINT;
}

/**
 * A title reduced to something a file system will accept, keeping the characters it can —
 * a Chinese or Vietnamese title stays readable rather than being stripped to nothing by an
 * ASCII-only slug. Reserved and control characters are dropped outright, then what whitespace
 * is left folds into dashes. Falls back to `fallback` when a title contributes no usable character.
 */
export function fileSlug(title: string, fallback: string): string {
  const cleaned = [...title]
    .filter(isNameSafe)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

  return cleaned || fallback;
}

/**
 * A name reduced to a directory name: lower case, letters and digits only.
 * Punctuation, spaces and dashes are dropped rather than folded into a
 * separator, and diacritics fold onto the letter they sit on, so a Vietnamese
 * name comes out plain ASCII. Letters of a script that has no such
 * decomposition (Chinese, say) are kept, since dropping them would leave every
 * such name on the same fallback.
 */
export function directorySlug(name: string, fallback: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
    .slice(0, MAX_SLUG_LENGTH);

  return cleaned || fallback;
}

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
  return path.join(getAppDataDir(), 'workspaces', directorySlug(workspaceName, 'workspace'));
}

/** Where the Semantic Analysis step writes its per-chapter extractions and the world bible merged from them. */
export function getAppWorkspaceExtractionDir(workspaceName: string): string {
  return path.join(getAppWorkspaceDir(workspaceName), 'extractions');
}

/** A stored path as it reads in a log line — relative to the app's own base dir, since the absolute prefix says nothing. */
export function appRelativePath(target: string): string {
  return path.relative(getAppBaseDir(), target).split(path.sep).join('/');
}

/** One chapter of a workspace's working copy — its manifest entry and the body on disk beside it. */
export interface WorkspaceChapter {
  entry: LibraryPackageChapter;
  body: string;
}

/**
 * Lays a library package out in the workspace's working directory, which leaves
 * it in exactly the shape the archive has: `library.json`, `chapters/`, and the
 * cover. The item is re-exported on every execution, so a chapter edited since
 * the last run is picked up — stale chapter files are cleared first, and what the
 * steps themselves have written (`extractions/`) is left alone. Takes the archive
 * rather than building it, so this module stays free of the database.
 */
export function prepareWorkspaceDir(workspaceName: string, packageData: Buffer): string {
  const dir = getAppWorkspaceDir(workspaceName);

  fs.rmSync(path.join(dir, LIBRARY_PACKAGE_CHAPTERS_DIR), { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  new AdmZip(packageData).extractAllTo(dir, true);

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
  return fs.existsSync(file) ? { entry, body: fs.readFileSync(file, 'utf8') } : undefined;
}

/** Custom scheme the renderer loads cover images through — a raw file path is not a URL a browser will load. */
export const COVER_PROTOCOL = 'app-cover';
