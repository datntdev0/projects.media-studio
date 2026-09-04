import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { config } from './config';
import { LIBRARY_PACKAGE_CHAPTERS_DIR, LIBRARY_PACKAGE_MANIFEST, type LibraryPackageChapter, type LibraryPackageManifest } from '@/shared/app-library-package';
import { TRANSLATION_LANGUAGE } from '@/shared/app-workspace-translation';
import { plainSlug } from '@/shared/text';

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

/** A name reduced to a directory name — `plainSlug`, capped, falling back when nothing usable is left. */
export function directorySlug(name: string, fallback: string): string {
  return plainSlug(name).slice(0, MAX_SLUG_LENGTH) || fallback;
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

/** A stored path as it reads in a log line — relative to the app's own base dir, since the absolute prefix says nothing. */
export function appRelativePath(target: string): string {
  return path.relative(getAppBaseDir(), target).split(path.sep).join('/');
}

/** The `data` root every stored asset hangs off — covers, and the per-item chapter files. */
export function getAppDataDir(): string {
  return path.join(getAppBaseDir(), 'data');
}

/** Scratch files that outlive nothing — what the LLM CLIs run from and write their answers to. Created on demand. */
export function getAppTempDir(): string {
  const dir = path.join(getAppDataDir(), 'temp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

/** Where the Semantic Translate step writes the translated world bible, the chapter metadata distributed from it, and the translated chapter texts. */
export function getAppWorkspaceTranslationDir(workspaceName: string): string {
  return path.join(getAppWorkspaceDir(workspaceName), 'translations', TRANSLATION_LANGUAGE);
}

const NARRATIONS_DIR = 'narrations';

/** Where the Narration Speech step writes each chapter's .wav and .srt, under a folder per language. */
export function getAppWorkspaceNarrationDir(workspaceName: string): string {
  return path.join(getAppWorkspaceDir(workspaceName), NARRATIONS_DIR);
}

const ILLUSTRATIONS_DIR = 'illustrations';

/** Where the Frame Illustration step writes the character design, its images, and the frames cut per chapter. */
export function getAppWorkspaceIllustrationDir(workspaceName: string): string {
  return path.join(getAppWorkspaceDir(workspaceName), ILLUSTRATIONS_DIR);
}

/** Custom scheme the renderer streams narration audio through — `app-narration://<workspace slug>/<lang>/<file>`. */
export const NARRATION_PROTOCOL = 'app-narration';

/** Custom scheme the renderer loads illustration images through — `app-illustration://<workspace slug>/characters/<file>`. */
export const ILLUSTRATION_PROTOCOL = 'app-illustration';

/** A file of a workspace's own step folder as a URL the renderer can load — the slug is the host, the rest the path under that folder. */
function workspaceFileUrl(scheme: string, workspaceName: string, segments: string[]): string {
  const tail = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `${scheme}://${directorySlug(workspaceName, 'workspace')}/${tail}`;
}

/** The file such a URL names — the host is the workspace folder as it is on disk, the path the rest under `subDir`. */
function workspaceFileOf(url: string, subDir: string): string {
  const { hostname, pathname } = new URL(url);
  const segments = decodeURIComponent(pathname).split('/').filter((segment) => segment !== '' && segment !== '.' && segment !== '..');
  return path.join(getAppDataDir(), 'workspaces', hostname, subDir, ...segments);
}

export function narrationFileUrl(workspaceName: string, language: string, fileName: string): string {
  return workspaceFileUrl(NARRATION_PROTOCOL, workspaceName, [language, fileName]);
}

export function narrationFileOf(url: string): string {
  return workspaceFileOf(url, NARRATIONS_DIR);
}

export function illustrationFileUrl(workspaceName: string, segments: string[]): string {
  return workspaceFileUrl(ILLUSTRATION_PROTOCOL, workspaceName, segments);
}

export function illustrationFileOf(url: string): string {
  return workspaceFileOf(url, ILLUSTRATIONS_DIR);
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
 * steps themselves have written (`extractions/`, `translations/`) is left alone. Takes the archive
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

function workspaceChapterEntry(workspaceName: string, idx: number): LibraryPackageChapter | undefined {
  return readWorkspaceManifest(workspaceName)?.chapters.find((chapter) => chapter.idx === idx);
}

function chapterFileOf(workspaceName: string, entry: LibraryPackageChapter | undefined): string | undefined {
  if (!entry?.file) return undefined;
  const file = path.join(getAppWorkspaceDir(workspaceName), entry.file);
  return fs.existsSync(file) ? file : undefined;
}

/** The working copy's file for one chapter, or undefined when it was never fetched and so has none. */
export function workspaceChapterFile(workspaceName: string, idx: number): string | undefined {
  return chapterFileOf(workspaceName, workspaceChapterEntry(workspaceName, idx));
}

/** One chapter of the working copy, or undefined when it was never fetched and so carries no body. */
export function readWorkspaceChapter(workspaceName: string, idx: number): WorkspaceChapter | undefined {
  const entry = workspaceChapterEntry(workspaceName, idx);
  const file = chapterFileOf(workspaceName, entry);
  return entry && file ? { entry, body: fs.readFileSync(file, 'utf8') } : undefined;
}

/** Custom scheme the renderer loads cover images through — a raw file path is not a URL a browser will load. */
export const COVER_PROTOCOL = 'app-cover';

/** A closed span of bytes, both ends inclusive, as HTTP ranges are. */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * The bytes a `Range: bytes=a-b` header asks for out of a file of `size` bytes,
 * clamped to the file. `a-` runs to the end, `-n` is the last n bytes. Undefined
 * when there is no header, it is not one of those forms, or it lies past the end.
 */
export function byteRangeOf(header: string | null, size: number): ByteRange | undefined {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match || (match[1] === '' && match[2] === '')) return undefined;
  const [, from, to] = match;
  const start = from === '' ? Math.max(0, size - Number(to)) : Number(from);
  const end = from !== '' && to !== '' ? Math.min(Number(to), size - 1) : size - 1;
  return start <= end ? { start, end } : undefined;
}

/** The cached cover an `app-cover` URL names. Chromium collapses a host-less URL's path into the host, so covers use a throwaway host and keep the file name in the path. */
export function coverFileOf(url: string): string {
  return path.join(getAppCoverDir(), path.basename(decodeURIComponent(new URL(url).pathname)));
}
