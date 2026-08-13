// The provider's constructor names `FirebaseAdminService`, and that file reaches
// the Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { Timestamp } from 'firebase-admin/firestore';
import { SYSTEM_CACHE_COLLECTION } from '../firebase/collections';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CacheProvider, CacheType } from './cache.provider';

const KEY = 'novel:validate:novel543:0413553971';

const OBJECT = `caches/${KEY}.json`;

const A_DAY = 24 * 60 * 60 * 1000;

/** A validate response, near enough: a shape with a base64 string in it. */
const PREVIEW = {
  type: 'novel',
  content: {
    metadata: { title: '劍來', status: 'ongoing', genres: ['武俠'] },
    chapters: [{ index: 1, title: '第一章', url: 'https://www.novel543.com/0413553971/8095_1.html' }],
    coverBinary: 'data:image/jpeg;base64,/9j/4AAQ',
  },
};

/** What one saved object holds, so the spec can assert how it was written. */
interface StoredFile {
  contents: Buffer;
  contentType?: string;
  token?: string;
}

/**
 * Firestore as this provider uses it: a document you name, read whole, write whole
 * and delete. Every id it is asked for is recorded, because the one thing that
 * cannot be asserted from behaviour alone is that the id is legal.
 */
class FakeFirestore {
  readonly documents = new Map<string, Record<string, unknown>>();

  readonly ids: string[] = [];

  collection(name: string) {
    expect(name).toBe(SYSTEM_CACHE_COLLECTION);

    return { doc: (id: string) => this.doc(id) };
  }

  private doc(id: string) {
    this.ids.push(id);

    return {
      get: () => Promise.resolve({ data: () => this.documents.get(id) }),
      set: (data: Record<string, unknown>) => {
        this.documents.set(id, data);

        return Promise.resolve();
      },
      delete: () => {
        this.documents.delete(id);

        return Promise.resolve();
      },
    };
  }
}

/** The bucket, holding what was saved and refusing what was never written. */
class FakeBucket {
  readonly files = new Map<string, StoredFile>();

  /** Set to make the next read fail, for the document-outlives-its-file case. */
  unreadable = false;

  file(path: string) {
    return {
      save: (contents: Buffer, options: { contentType?: string; metadata?: { metadata?: Record<string, string> } }) => {
        this.files.set(path, { contents, contentType: options.contentType, token: options.metadata?.metadata?.firebaseStorageDownloadTokens });

        return Promise.resolve();
      },
      download: () => {
        const stored = this.files.get(path);

        if (!stored || this.unreadable) {
          return Promise.reject(new Error(`No such object: ${path}`));
        }

        return Promise.resolve([stored.contents]);
      },
      delete: (options?: { ignoreNotFound?: boolean }) => {
        if (!this.files.delete(path) && !options?.ignoreNotFound) {
          return Promise.reject(new Error(`No such object: ${path}`));
        }

        return Promise.resolve();
      },
    };
  }
}

/**
 * `downloadUrl` is the real service's, and it is where the bucket and the emulator
 * host are read — neither of which this provider knows about. The stub returns
 * something recognisable, and the spec asserts the provider stores what it was
 * given rather than a URL of its own making.
 */
function fixture() {
  const firestore = new FakeFirestore();
  const bucket = new FakeBucket();

  const firebase = {
    firestore,
    bucket,
    downloadUrl: (objectPath: string, token: string) => `https://storage.test/${encodeURIComponent(objectPath)}?token=${token}`,
  } as unknown as FirebaseAdminService;

  return { firestore, bucket, cache: new CacheProvider(firebase) };
}

describe('CacheProvider', () => {
  it('is null for an entry that was never written', async () => {
    const { cache } = fixture();

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
  });

  it('round trips a value through the bucket', async () => {
    const { cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toEqual(PREVIEW);
  });

  it('writes the value as a JSON file, not into the document', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);

    const stored = bucket.files.get(OBJECT);

    expect(stored?.contentType).toBe('application/json');
    expect(JSON.parse(stored?.contents.toString() ?? '')).toEqual(PREVIEW);
    expect(JSON.stringify([...firestore.documents.values()])).not.toContain('劍來');
  });

  it('points the document at the file it just wrote', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);

    const [document] = [...firestore.documents.values()];
    const { token } = bucket.files.get(OBJECT) ?? {};

    expect(document).toMatchObject({
      cacheKey: KEY,
      cacheType: CacheType.Scraping,
      dataUrl: `https://storage.test/${encodeURIComponent(OBJECT)}?token=${token}`,
    });
    expect((document?.expiredAt as Timestamp).toMillis()).toBeGreaterThan(Date.now());
  });

  it('is null past the TTL, and drops the document and its file as it finds it', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, -1);

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
    expect(firestore.documents.size).toBe(0);
    expect(bucket.files.size).toBe(0);
  });

  it('drops an entry whose file has gone, rather than answering with it', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    bucket.unreadable = true;

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
    expect(firestore.documents.size).toBe(0);
  });

  it('drops an entry whose file is not readable JSON', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    bucket.files.set(OBJECT, { contents: Buffer.from('half a {') });

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
    expect(firestore.documents.size).toBe(0);
    expect(bucket.files.size).toBe(0);
  });

  it('replaces the value under a key it already holds', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    await cache.set(KEY, CacheType.Scraping, { ...PREVIEW, type: 'image' }, A_DAY);

    expect(firestore.documents.size).toBe(1);
    expect(bucket.files.size).toBe(1);
    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toMatchObject({ type: 'image' });
  });

  it('files a key holding a slash under a legal document id', async () => {
    const { firestore, cache } = fixture();
    const slashed = 'novel:validate:novel543:https://www.novel543.com/0413553971';

    await cache.set(slashed, CacheType.Scraping, PREVIEW, A_DAY);

    expect(firestore.ids.every((id) => !id.includes('/'))).toBe(true);
    await expect(cache.get(slashed, CacheType.Scraping)).resolves.toEqual(PREVIEW);
  });

  it('drops the document and the file on request', async () => {
    const { firestore, bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    await cache.drop(KEY, CacheType.Scraping);

    expect(firestore.documents.size).toBe(0);
    expect(bucket.files.size).toBe(0);
  });
});
