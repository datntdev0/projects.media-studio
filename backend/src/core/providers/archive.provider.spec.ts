// The provider's constructor names `FirebaseAdminService`, and that file reaches the
// Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException } from '@nestjs/common';
import { Readable, Writable } from 'node:stream';
import { AppConfigService } from '../config/app-config.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { ArchiveProvider } from './archive.provider';

const PACKAGE = 'packages/item-1/export.zip';

const BODY = 'Chapter one.\n\nThe harbour rang nine times.';

/** Small enough that a body of a few hundred bytes arrives in several pieces. */
const CHUNK = 64;

interface StoredFile {
  contents: Buffer;
  options?: { contentType?: string, metadata?: { contentDisposition?: string, metadata?: Record<string, string> } };
}

/** The bucket, as two streams over a `Map` — which is what a zip round trip needs of it. */
class FakeBucket {
  readonly files = new Map<string, StoredFile>();

  put(path: string, contents: string): void {
    this.files.set(path, { contents: Buffer.from(contents, 'utf8') });
  }

  file(path: string) {
    return {
      createWriteStream: (options: StoredFile['options']) => {
        const chunks: Buffer[] = [];
        const sink = new Writable({
          write(chunk: Buffer, _encoding, next) {
            chunks.push(Buffer.from(chunk));
            next();
          },
        });

        sink.on('finish', () => this.files.set(path, { contents: Buffer.concat(chunks), options }));

        return sink;
      },
      createReadStream: () => {
        const stored = this.files.get(path);

        if (!stored) {
          return new Readable({ read() { this.destroy(new Error(`No such object: ${path}`)); } });
        }

        return Readable.from(pieces(stored.contents));
      },
      delete: () => {
        this.files.delete(path);

        return Promise.resolve();
      },
    };
  }
}

function* pieces(contents: Buffer): Generator<Buffer> {
  for (let from = 0; from < contents.length; from += CHUNK) {
    yield contents.subarray(from, from + CHUNK);
  }
}

const config = { firebase: { storageBucket: 'demo.firebasestorage.app', emulators: { storageHost: '127.0.0.1:9199' } } } as AppConfigService;

describe('ArchiveProvider', () => {
  let bucket: FakeBucket;
  let provider: ArchiveProvider;

  beforeEach(() => {
    bucket = new FakeBucket();
    provider = new ArchiveProvider({ bucket } as unknown as FirebaseAdminService, config);
  });

  /** Everything back out, keyed by entry name. */
  async function readAll(wanted: (name: string) => boolean = () => true): Promise<Map<string, string>> {
    const read = new Map<string, string>();

    await provider.readFrom(PACKAGE, wanted, (name, body) => {
      read.set(name, body.toString('utf8'));

      return Promise.resolve();
    });

    return read;
  }

  it('writes an archive and reads every entry back', async () => {
    bucket.put('content/item-1/one.txt', BODY);
    bucket.put('covers/item-1/cover.jpg', 'not really a jpeg');

    const written = await provider.writeTo(PACKAGE, 'silent-cartographer-export.zip', async (into) => {
      await into.text('manifest.json', '{"schema":1}');
      await into.object('chapters/0001.txt', 'content/item-1/one.txt');
      await into.image('cover.jpg', 'covers/item-1/cover.jpg');
    });

    expect(written.bytes).toBe(bucket.files.get(PACKAGE)?.contents.length);
    expect(written.url).toMatch(/^http:\/\/127\.0\.0\.1:9199\/v0\/b\/demo\.firebasestorage\.app\/o\/packages%2Fitem-1%2Fexport\.zip\?alt=media&token=/);

    await expect(readAll()).resolves.toEqual(new Map([
      ['manifest.json', '{"schema":1}'],
      ['chapters/0001.txt', BODY],
      ['cover.jpg', 'not really a jpeg'],
    ]));
  });

  it('saves the archive under the filename a browser should see', async () => {
    await provider.writeTo(PACKAGE, 'silent-cartographer-export.zip', () => Promise.resolve());

    const stored = bucket.files.get(PACKAGE);

    expect(stored?.options?.contentType).toBe('application/zip');
    expect(stored?.options?.metadata?.contentDisposition).toBe('attachment; filename="silent-cartographer-export.zip"');
    expect(stored?.options?.metadata?.metadata?.firebaseStorageDownloadTokens).toEqual(expect.any(String));
  });

  it('never decompresses an entry the caller did not want', async () => {
    bucket.put('content/item-1/one.txt', BODY);

    await provider.writeTo(PACKAGE, 'x.zip', async (into) => {
      await into.text('manifest.json', '{"schema":1}');
      await into.object('chapters/0001.txt', 'content/item-1/one.txt');
    });

    await expect(readAll(name => name === 'manifest.json')).resolves.toEqual(new Map([['manifest.json', '{"schema":1}']]));
  });

  it('refuses a package it cannot open', async () => {
    await expect(readAll()).rejects.toBeInstanceOf(BadRequestException);
  });

  // The wrapping above must not swallow what the caller's own work threw: an import
  // writing a chapter is doing real I/O inside `onEntry`, and its failure is not a 400.
  it("lets the caller's own failure through unchanged", async () => {
    await provider.writeTo(PACKAGE, 'x.zip', into => into.text('manifest.json', '{}'));

    const mine = new Error('Storage is down');

    await expect(provider.readFrom(PACKAGE, () => true, () => Promise.reject(mine))).rejects.toBe(mine);
  });

  it('removes a package, and is quiet about one that is not there', async () => {
    await provider.writeTo(PACKAGE, 'x.zip', () => Promise.resolve());
    await provider.remove(PACKAGE);

    expect(bucket.files.has(PACKAGE)).toBe(false);
    await expect(provider.remove(PACKAGE)).resolves.toBeUndefined();
  });
});
