import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CollectionReference, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { SYSTEM_CACHE_COLLECTION } from '../firebase/collections';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/**
 * Who an entry belongs to. Part of its identity rather than a label: two features
 * are free to key on the same string, and neither should see the other's answer.
 */
export enum CacheType {
  Scraping = 'scraping',
}

/** Where cached files live in the bucket. */
const CACHE_PREFIX = 'caches';

const CONTENT_TYPE = 'application/json';

/**
 * Answers that are slow to come by, kept until they expire.
 *
 * The value goes to Cloud Storage as JSON under `caches/`, and Firestore holds
 * where to read it and when it dies — so an entry is not bounded by a document's
 * 1 MB, and what was cached can be opened in a browser when it needs explaining.
 *
 * JSON is the only format. Anything binary is a base64 string inside the value the
 * caller is already storing, which is why there is no data type to carry, no bytes
 * to hand over, and one pair of methods rather than two.
 *
 * Nothing here knows what an entry means, and `T` is the caller's word rather than
 * a checked one: a shape that changes reads back as the shape that was stored,
 * which is what the TTL is for.
 *
 * One constraint comes with the file: an object is named after its key alone, so a
 * key has to be unique across cache types, not merely within one. The Firestore
 * document is keyed by both, and the two would otherwise disagree about who owns
 * the file.
 *
 * In core rather than in a feature module, because a TTL cache is not a domain
 * concept and the next thing that wants one will not be the scraping module.
 */
@Injectable()
export class CacheProvider {
  private readonly logger = new Logger(CacheProvider.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  /**
   * The cached value, or null where there is none, it has expired, or it cannot be
   * read. Never throws: a cache is not a place to fail from, so a corrupt entry
   * costs a re-fetch rather than a 500.
   */
  async get<T>(cacheKey: string, cacheType: CacheType): Promise<T | null> {
    const data = (await this.documentFor(cacheKey, cacheType).get()).data();

    if (!data) {
      return null;
    }

    const expiredAt = data.expiredAt as Timestamp | undefined;

    if (!expiredAt || expiredAt.toMillis() <= Date.now()) {
      // Dropped as it is found. Firestore can expire the document itself with a
      // TTL policy on `expiredAt`, and in production it should — but nothing but
      // this deletes the file with it, and the emulator has no such policy at all.
      await this.remove(cacheKey, cacheType).catch((cause: unknown) => this.logger.warn(`Could not drop the expired entry ${cacheType}:${cacheKey}`, cause));

      return null;
    }

    return this.read<T>(cacheKey, cacheType);
  }

  /**
   * Writes the file, then the document that points at it — in that order, so a
   * failure leaves an unreferenced object rather than an entry pointing at nothing.
   */
  async set<T>(cacheKey: string, cacheType: CacheType, value: T, ttlMs: number): Promise<void> {
    const token = randomUUID();

    await this.fileFor(cacheKey).save(Buffer.from(JSON.stringify(value)), {
      contentType: CONTENT_TYPE,
      resumable: false,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });

    await this.documentFor(cacheKey, cacheType).set({
      cacheKey,
      cacheType,
      dataUrl: this.firebase.downloadUrl(objectPathFor(cacheKey), token),
      expiredAt: Timestamp.fromMillis(Date.now() + ttlMs),
    });
  }

  /** The document and the file it points at. Quiet about a file that is not there. */
  drop(cacheKey: string, cacheType: CacheType): Promise<void> {
    return this.remove(cacheKey, cacheType);
  }

  /**
   * The file behind a live document, read through the Admin SDK rather than over
   * its URL — the service that wrote it does not need a token to read it back.
   *
   * A file that cannot be read or parsed means the document outlived it, or that
   * something wrote nonsense. The entry is worthless either way, so it goes.
   */
  private async read<T>(cacheKey: string, cacheType: CacheType): Promise<T | null> {
    try {
      const [contents] = await this.fileFor(cacheKey).download();

      return JSON.parse(contents.toString()) as T;
    } catch (cause: unknown) {
      this.logger.warn(`${cacheType}:${cacheKey} could not be read back`, cause);
      await this.remove(cacheKey, cacheType);

      return null;
    }
  }

  /** The file first, so a failure cannot leave the document pointing at a deleted object. */
  private async remove(cacheKey: string, cacheType: CacheType): Promise<void> {
    await this.fileFor(cacheKey).delete({ ignoreNotFound: true });
    await this.documentFor(cacheKey, cacheType).delete();
  }

  private get collection(): CollectionReference {
    return this.firebase.firestore.collection(SYSTEM_CACHE_COLLECTION);
  }

  /**
   * Where an entry is filed: the type and the key together, so one lookup answers
   * for both and two entries cannot end up live under one key.
   *
   * Encoded because a document id may not contain `/`, and a cache key eventually
   * will. Both fields are stored on the document anyway, so what is written stays
   * legible in the emulator UI.
   */
  private documentFor(cacheKey: string, cacheType: CacheType): DocumentReference {
    return this.collection.doc(encodeURIComponent(`${cacheType}:${cacheKey}`));
  }

  private fileFor(cacheKey: string) {
    return this.firebase.bucket.file(objectPathFor(cacheKey));
  }
}

/** `caches/novel:validate:novel543:0413553971.json` — every entry is JSON, so every file is `.json`. */
function objectPathFor(cacheKey: string): string {
  return `${CACHE_PREFIX}/${cacheKey}.json`;
}
