import fs from 'node:fs';
import path from 'node:path';
import { COVER_PROTOCOL, getAppCoverDir } from './paths';

/** Extensions covers are written with, keyed by the content type they were served/uploaded as. */
export const COVER_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Writes cover bytes under `fileName` and returns the app-cover:// URL the renderer can load it through. */
export function writeCoverFile(fileName: string, data: Buffer): string {
  const dir = getAppCoverDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), data);
  return `${COVER_PROTOCOL}://cover/${encodeURIComponent(fileName)}`;
}

/** Deletes a cover file previously returned by `writeCoverFile`; a no-op for anything else (e.g. an http(s) URL). */
export function deleteCoverFile(coverUrl: string | null | undefined): void {
  if (!coverUrl || !coverUrl.startsWith(`${COVER_PROTOCOL}://`)) return;
  const fileName = path.basename(decodeURIComponent(new URL(coverUrl).pathname));
  fs.rmSync(path.join(getAppCoverDir(), fileName), { force: true });
}
