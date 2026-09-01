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

/** The bytes each format starts with. Sniffing beats trusting a file name, which an archive from elsewhere may have got wrong. */
const IMAGE_SIGNATURES: { magic: number[]; mediaType: string }[] = [
  { magic: [0xff, 0xd8, 0xff], mediaType: 'image/jpeg' },
  { magic: [0x89, 0x50, 0x4e, 0x47], mediaType: 'image/png' },
  { magic: [0x47, 0x49, 0x46, 0x38], mediaType: 'image/gif' },
  { magic: [0x52, 0x49, 0x46, 0x46], mediaType: 'image/webp' },
];

/** The image's media type read from its leading bytes, or null when the bytes are not an image this app shows. */
export function imageMediaType(data: Buffer): string | null {
  const match = IMAGE_SIGNATURES.find(({ magic }) => magic.every((byte, index) => data[index] === byte));
  return match?.mediaType ?? null;
}

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
