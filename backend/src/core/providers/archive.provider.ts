import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { AppConfigService } from '../config/app-config.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { downloadUrl } from '../firebase/storage-url';

/** What `storage.rules` admits a package as. */
const ZIP_CONTENT_TYPE = 'application/zip';

/** What every failure to open one says. The cause is logged rather than shown. */
const UNREADABLE = 'Could not open the package — it is not a readable .zip';

const EMPTY = new Uint8Array(0);

/** A written archive: where to read it back, and what it weighs. */
export interface StoredArchive {
  url: string;
  bytes: number;
}

/**
 * One entry going in. All three await, so a slow upload slows the read feeding it —
 * which is what keeps a package of any size off this process's heap.
 */
export interface ArchiveWriter {
  /** A string this process holds. */
  text(name: string, body: string): Promise<void>;
  /** A stored object, streamed straight through and deflated. */
  object(name: string, path: string): Promise<void>;
  /** The same, stored as it is: deflating a JPEG costs CPU to grow the file. */
  image(name: string, path: string): Promise<void>;
}

/** One entry coming out, whole. Only the entries `wanted` said yes to are ever built. */
export type ArchiveEntry = (name: string, body: Buffer) => Promise<void>;

/**
 * Zip archives, read from and written to Cloud Storage without ever being held whole.
 *
 * In core rather than in the library module, for `ContentFileProvider`'s reason: a
 * manager should not import a compression library, and the next thing that wants an
 * archive will not be a novel.
 *
 * Streaming both ways, through `fflate`'s push API. That is also the one thing a
 * caller has to design around: the reader has no central directory to consult and
 * cannot seek, so whether an entry is read at all is decided from its name alone, the
 * moment its header goes past. Anything that needs two kinds of entry in a fixed order
 * reads the archive twice — see `LibraryImportManager`.
 */
@Injectable()
export class ArchiveProvider {
  private readonly logger = new Logger(ArchiveProvider.name);

  constructor(private readonly firebase: FirebaseAdminService, private readonly config: AppConfigService) {}

  /**
   * An archive, built by `build` and filed at `path`.
   *
   * `filename` becomes the object's `Content-Disposition`, so opening the URL saves
   * the file under a name a person recognises rather than under a UUID — which is
   * what lets the frontend hand the browser the URL and nothing else.
   */
  async writeTo(path: string, filename: string, build: (into: ArchiveWriter) => Promise<void>): Promise<StoredArchive> {
    const token = randomUUID();
    const upload = this.firebase.bucket.file(path).createWriteStream({
      contentType: ZIP_CONTENT_TYPE,
      resumable: false,
      metadata: { contentDisposition: `attachment; filename="${filename}"`, metadata: { firebaseStorageDownloadTokens: token } },
    });

    // Attached now, and its rejection parked, so an upload that fails while `build`
    // is running is a rejected await below rather than an uncaught 'error' event.
    const done = finished(upload);
    void done.catch(() => undefined);

    let bytes = 0;

    // A compression failure destroys the upload rather than raising a flag: that is
    // already the one path a failure travels, and it is the one `done` is watching.
    const zip = new Zip((error, chunk, final) => {
      if (error) {
        upload.destroy(error);
        return;
      }

      bytes += chunk.length;
      upload.write(chunk);

      if (final) {
        upload.end();
      }
    });

    try {
      await build(this.writer(zip, upload));
      zip.end();
    } catch (cause: unknown) {
      upload.destroy();
      throw cause;
    }

    await done;

    return { url: downloadUrl(this.config, path, token), bytes };
  }

  /**
   * Every entry `wanted` says yes to, one at a time and in the order the archive
   * holds them. An entry it refuses is never decompressed.
   *
   * `onEntry` is awaited before the next chunk of the archive is read, so what the
   * caller does with one entry is what paces the whole pass.
   */
  async readFrom(path: string, wanted: (name: string) => boolean, onEntry: ArchiveEntry): Promise<void> {
    for await (const entry of this.entries(path, wanted)) {
      await onEntry(entry.name, entry.body);
    }
  }

  /** Drops a package nothing needs again. Quiet about one that is not there, as `ContentFileProvider.discard` is. */
  async remove(path: string): Promise<void> {
    try {
      await this.firebase.bucket.file(path).delete({ ignoreNotFound: true });
    } catch (cause: unknown) {
      this.logger.warn(`Could not remove the package ${path}`, cause);
    }
  }

  /**
   * The pass itself, as a generator: a `yield` suspends the read, which is the whole
   * of the backpressure, and a consumer that throws unwinds it through `finally`
   * rather than through the `catch` that turns a broken archive into a `400`.
   */
  private async *entries(path: string, wanted: (name: string) => boolean): AsyncGenerator<{ name: string, body: Buffer }> {
    const unzip = new Unzip();
    const ready: { name: string, body: Buffer }[] = [];
    let failure: Error | null = null;

    unzip.register(UnzipInflate);

    unzip.onfile = (file) => {
      if (!wanted(file.name)) {
        return;
      }

      const chunks: Uint8Array[] = [];

      file.ondata = (error, chunk, final) => {
        if (error) {
          failure ??= error;
        } else if (chunk.length > 0) {
          chunks.push(chunk);
        }

        if (final) {
          ready.push({ name: file.name, body: Buffer.concat(chunks) });
        }
      };

      file.start();
    };

    const source = this.firebase.bucket.file(path).createReadStream();

    const feed = (chunk: Uint8Array, final = false): void => {
      unzip.push(chunk, final);

      if (failure) {
        throw failure;
      }
    };

    try {
      for await (const chunk of source) {
        feed(chunk as Uint8Array);

        while (ready.length > 0) {
          yield ready.shift()!;
        }
      }

      feed(EMPTY, true);

      while (ready.length > 0) {
        yield ready.shift()!;
      }
    } catch (cause: unknown) {
      this.logger.warn(`Could not read the package ${path}`, cause);

      throw new BadRequestException(UNREADABLE);
    } finally {
      source.destroy();
    }
  }

  /** The three ways in, over one archive. Each waits for the upload before reading more. */
  private writer(zip: Zip, upload: Writable): ArchiveWriter {
    const drain = async (): Promise<void> => {
      if (upload.writableNeedDrain) {
        await once(upload, 'drain');
      }
    };

    const stream = async (entry: ZipDeflate | ZipPassThrough, path: string): Promise<void> => {
      zip.add(entry);

      for await (const chunk of this.firebase.bucket.file(path).createReadStream()) {
        entry.push(chunk as Uint8Array);
        await drain();
      }

      entry.push(EMPTY, true);
    };

    return {
      text: async (name, body) => {
        const entry = new ZipDeflate(name);

        zip.add(entry);
        entry.push(Buffer.from(body, 'utf8'), true);

        await drain();
      },
      object: (name, path) => stream(new ZipDeflate(name), path),
      image: (name, path) => stream(new ZipPassThrough(name), path),
    };
  }
}
