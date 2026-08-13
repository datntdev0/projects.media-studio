import { Injectable, Logger } from '@nestjs/common';
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

/** What one object holds: when it dies, and what was cached. */
interface CacheEnvelope<T> {
  /** Epoch milliseconds. Read on the way out — nothing expires an entry on its own. */
  expiredAt: number;
  value: T;
}

/**
 * Answers that are slow to come by, kept until they expire.
 *
 * One object per entry in Cloud Storage, under `caches/{type}/`, holding both the
 * value and when it dies. No Firestore: a pointer document would only say where
 * the file is and when it expires, and both fit in the file — one store means no
 * write ordering to get right, no entry that can outlive its file, and nothing to
 * reconcile when one of the two writes fails.
 *
 * JSON is the only format. Anything binary is a base64 string inside the value the
 * caller is already storing, which is why there is no data type to carry and no
 * bytes to hand over.
 *
 * Nothing here knows what an entry means, and `T` is the caller's word rather than
 * a checked one: a shape that changes reads back as the shape that was stored,
 * which is what the TTL is for.
 *
 * Expiry is enforced on read. A bucket lifecycle rule on the prefix is what would
 * reclaim an entry nobody asks for again, and in production it should — but an
 * entry past its TTL never answers, whether or not anything has swept it.
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
    const envelope = await this.read<T>(cacheKey, cacheType);

    if (!envelope) {
      return null;
    }

    if (envelope.expiredAt <= Date.now()) {
      // Dropped as it is found, so the next caller does not download it again to
      // reach the same conclusion.
      await this.drop(cacheKey, cacheType).catch((cause: unknown) => this.logger.warn(`Could not drop the expired entry ${cacheType}:${cacheKey}`, cause));

      return null;
    }

    return envelope.value;
  }

  /** One write, so there is no half-written entry to recover from. */
  async set<T>(cacheKey: string, cacheType: CacheType, value: T, ttlMs: number): Promise<void> {
    const envelope: CacheEnvelope<T> = { expiredAt: Date.now() + ttlMs, value };

    await this.fileFor(cacheKey, cacheType).save(Buffer.from(JSON.stringify(envelope)), {
      contentType: CONTENT_TYPE,
      resumable: false,
    });
  }

  /** Quiet about an entry that is not there — dropping one twice is not a failure. */
  async drop(cacheKey: string, cacheType: CacheType): Promise<void> {
    await this.fileFor(cacheKey, cacheType).delete({ ignoreNotFound: true });
  }

  /**
   * The stored envelope, read through the Admin SDK — the service that wrote it
   * does not need a URL to read it back.
   *
   * A file that cannot be read or parsed is worthless whatever went wrong, so it
   * goes. A missing one is the ordinary miss, and says nothing.
   */
  private async read<T>(cacheKey: string, cacheType: CacheType): Promise<CacheEnvelope<T> | null> {
    const file = this.fileFor(cacheKey, cacheType);

    let contents: Buffer;

    try {
      [contents] = await file.download();
    } catch {
      return null;
    }

    try {
      return JSON.parse(contents.toString()) as CacheEnvelope<T>;
    } catch (cause: unknown) {
      this.logger.warn(`${cacheType}:${cacheKey} could not be read back`, cause);
      await this.drop(cacheKey, cacheType);

      return null;
    }
  }

  private fileFor(cacheKey: string, cacheType: CacheType) {
    return this.firebase.bucket.file(objectPathFor(cacheKey, cacheType));
  }
}

/**
 * `caches/scraping/novel%3Avalidate%3Anovel543%3A0413553971.json` — the type is a
 * folder and the key is one name under it, so two types are free to hold the same
 * key. Encoded because a key eventually carries a `/`, and an unencoded one would
 * file the entry under a folder of its own making.
 */
function objectPathFor(cacheKey: string, cacheType: CacheType): string {
  return `${CACHE_PREFIX}/${cacheType}/${encodeURIComponent(cacheKey)}.json`;
}
