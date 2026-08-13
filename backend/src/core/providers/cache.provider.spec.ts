// The provider's constructor names `FirebaseAdminService`, and that file reaches
// the Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { CacheProvider, CacheType } from './cache.provider';

const KEY = 'novel:validate:novel543:0413553971';

const OBJECT = `caches/scraping/${encodeURIComponent(KEY)}.json`;

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
}

/** The bucket, holding what was saved and refusing what was never written. */
class FakeBucket {
  readonly files = new Map<string, StoredFile>();

  /** Set to make the next read fail, for the object-that-cannot-be-fetched case. */
  unreadable = false;

  file(path: string) {
    return {
      save: (contents: Buffer, options: { contentType?: string }) => {
        this.files.set(path, { contents, contentType: options.contentType });

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

function fixture() {
  const bucket = new FakeBucket();
  const firebase = { bucket } as unknown as FirebaseAdminService;

  return { bucket, cache: new CacheProvider(firebase) };
}

/** What the object holds, as the provider wrote it. */
function envelopeIn(bucket: FakeBucket, path = OBJECT) {
  return JSON.parse(bucket.files.get(path)?.contents.toString() ?? 'null') as { expiredAt: number; value: unknown } | null;
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

  it('writes one JSON object holding the value and when it dies', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);

    expect(bucket.files.size).toBe(1);
    expect(bucket.files.get(OBJECT)?.contentType).toBe('application/json');
    expect(envelopeIn(bucket)?.value).toEqual(PREVIEW);
    expect(envelopeIn(bucket)?.expiredAt).toBeGreaterThan(Date.now());
  });

  it('is null past the TTL, and drops the entry as it finds it', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, -1);

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
    expect(bucket.files.size).toBe(0);
  });

  it('is null for an entry whose object cannot be fetched', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    bucket.unreadable = true;

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
  });

  it('drops an entry whose object is not readable JSON', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    bucket.files.set(OBJECT, { contents: Buffer.from('half a {') });

    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toBeNull();
    expect(bucket.files.size).toBe(0);
  });

  it('replaces the value under a key it already holds', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    await cache.set(KEY, CacheType.Scraping, { ...PREVIEW, type: 'image' }, A_DAY);

    expect(bucket.files.size).toBe(1);
    await expect(cache.get(KEY, CacheType.Scraping)).resolves.toMatchObject({ type: 'image' });
  });

  it('files a key holding a slash as one object rather than a folder of its own', async () => {
    const { bucket, cache } = fixture();
    const slashed = 'novel:validate:novel543:https://www.novel543.com/0413553971';

    await cache.set(slashed, CacheType.Scraping, PREVIEW, A_DAY);

    expect([...bucket.files.keys()].every((path) => path.split('/').length === 3)).toBe(true);
    await expect(cache.get(slashed, CacheType.Scraping)).resolves.toEqual(PREVIEW);
  });

  it('files the type as a folder, so two types can hold one key', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);

    expect([...bucket.files.keys()]).toEqual([OBJECT]);
  });

  it('drops an entry on request, and says nothing about dropping it twice', async () => {
    const { bucket, cache } = fixture();

    await cache.set(KEY, CacheType.Scraping, PREVIEW, A_DAY);
    await cache.drop(KEY, CacheType.Scraping);

    expect(bucket.files.size).toBe(0);
    await expect(cache.drop(KEY, CacheType.Scraping)).resolves.toBeUndefined();
  });
});
