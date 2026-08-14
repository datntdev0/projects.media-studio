import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/** Where an item's own bytes live — the shelf the browser already uploads to. */
const CONTENT_PREFIX = 'content';

/** What `storage.rules` admits a chapter body as, and what the reader fetches back. */
const TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

/** Where a download URL points when there is no emulator. */
const STORAGE_HOST = 'firebasestorage.googleapis.com';

/**
 * Bytes this process writes on an item's behalf, filed where the browser writes its
 * own: `content/{itemId}/…`.
 *
 * What makes this more than a `save()` is the URL it answers with. The browser stores
 * a `getDownloadURL()` URL on the row — `…/o/{path}?alt=media&token=…` — and the
 * reader `fetch`es it and `useContentFiles.discard` deletes it. So a scraped chapter
 * has to land on a row in exactly that form, or half the frontend would need a second
 * way to read a body. The token is written as object metadata, which is what
 * `getDownloadURL()` itself reads, so a URL built here and one built there are the
 * same URL.
 *
 * A signed URL is not the alternative: the emulators issue no credential to sign with.
 *
 * In core rather than in a feature module, for `CacheProvider`'s reason — writing a
 * file is not a domain concept, and the next thing that wants one will not be the
 * scraping module.
 */
@Injectable()
export class ContentFileProvider {
  private readonly logger = new Logger(ContentFileProvider.name);

  constructor(private readonly firebase: FirebaseAdminService, private readonly config: AppConfigService) {}

  /**
   * A chapter body, stored, and the URL to read it back with.
   *
   * Named at random rather than after the row, for the reason `useContentFiles` gives:
   * a body replaced mid-edit must not overwrite the one still being read.
   */
  async saveText(itemId: string, text: string): Promise<string> {
    const path = `${CONTENT_PREFIX}/${itemId}/${randomUUID()}.txt`;
    const token = randomUUID();

    await this.firebase.bucket.file(path).save(Buffer.from(text, 'utf8'), {
      contentType: TEXT_CONTENT_TYPE,
      resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });

    return this.downloadUrl(path, token);
  }

  /**
   * Drops an object a row no longer points at. Quiet about one that is not there, as
   * `CacheProvider.drop` is — and quiet about a URL that is not ours, which is not
   * ours to delete either.
   */
  async discard(url: string | null): Promise<void> {
    const path = url ? objectPathFrom(url) : null;

    if (!path) {
      return;
    }

    try {
      await this.firebase.bucket.file(path).delete({ ignoreNotFound: true });
    } catch (cause: unknown) {
      // The row already points elsewhere, so a leftover object is waste rather than
      // a fault — and not worth failing a finished scrape over.
      this.logger.warn(`Could not discard ${path}`, cause);
    }
  }

  /** The URL `getDownloadURL()` would hand the browser for the same object. */
  private downloadUrl(path: string, token: string): string {
    const emulator = this.config.firebase.emulators.storageHost;
    const origin = emulator ? `http://${emulator}` : `https://${STORAGE_HOST}`;

    return `${origin}/v0/b/${this.config.firebase.storageBucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  }
}

/**
 * The object a download URL names, or null for a URL that is not one.
 *
 * Everything after `/o/` up to the query is the path, encoded — which is what makes
 * `content/{itemId}/{uuid}.txt` one segment rather than three.
 */
function objectPathFrom(url: string): string | null {
  const encoded = /\/o\/([^?]+)/.exec(url)?.[1];

  return encoded ? decodeURIComponent(encoded) : null;
}
