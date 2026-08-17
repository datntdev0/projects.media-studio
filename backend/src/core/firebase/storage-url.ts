import { AppConfigService } from '../config/app-config.service';

/** Where a download URL points when there is no emulator. */
const STORAGE_HOST = 'firebasestorage.googleapis.com';

/**
 * The one place the shape of a Firebase download URL is written down.
 *
 * The browser stores a `getDownloadURL()` URL on every row — `…/o/{path}?alt=media&token=…`
 * — and the reader `fetch`es it back. Anything this process files in the bucket has to
 * answer with the same form, or half the frontend would need a second way to read it.
 */
export function downloadUrl(config: AppConfigService, path: string, token: string): string {
  const emulator = config.firebase.emulators.storageHost;
  const origin = emulator ? `http://${emulator}` : `https://${STORAGE_HOST}`;

  return `${origin}/v0/b/${config.firebase.storageBucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/**
 * The object a download URL names, or null for a URL that is not one.
 *
 * Everything after `/o/` up to the query is the path, encoded — which is what makes
 * `content/{itemId}/{uuid}.txt` one segment rather than three.
 */
export function objectPathFrom(url: string): string | null {
  const encoded = /\/o\/([^?]+)/.exec(url)?.[1];

  return encoded ? decodeURIComponent(encoded) : null;
}
