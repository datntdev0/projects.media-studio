import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';
import { objectPathFrom } from '../core/firebase/storage-url';
import { ArchiveProvider, ArchiveWriter } from '../core/providers/archive.provider';
import { nowIso } from '../_shared/helper';
import { LibraryPackageDto } from './dto/library-package.dto';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { ContentLanguages, TextContent } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType } from './entities/library-item.entity';
import { CONTENTS_ENTRY, ITEM_ENTRY, MANIFEST_ENTRY, NOT_PACKAGEABLE, PACKAGE_SCHEMA, PackageManifest, PackagedContent, coverEntry, originalBodyEntry, translationBodyEntry } from './entities/library-package.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryRepository } from './library.repository';

/** Where a packed item is filed, beside `content/{itemId}/` and `covers/{itemId}/`. */
const PACKAGE_PREFIX = 'packages';

/** One entry that has to be copied out of the bucket: where it goes, and where it comes from. */
interface PackagedBody {
  entry: string;
  path: string;
}

/**
 * A novel, packed into a `.zip` in the bucket.
 *
 * Reads and nothing else — no Firestore write happens here, which is what makes a
 * failed export an incomplete object nobody was given the URL of rather than a
 * half-changed item. Everything is worked out before the archive is opened, so the
 * manifest can state the counts and the entries can be written in reading order.
 *
 * Filed at one path per item — a re-export overwrites the last one rather than
 * piling up, so the bucket never holds more than the latest package of an item.
 */
@Injectable()
export class LibraryPackageManager {
  constructor(
    private readonly repository: LibraryRepository,
    private readonly contents: LibraryContentManager,
    private readonly archive: ArchiveProvider,
    private readonly config: AppConfigService,
  ) {}

  async export(itemId: string): Promise<LibraryPackageDto> {
    const item = await this.require(itemId);
    const originals = await this.contents.chapters(itemId);
    const translated = await this.contents.translations(itemId);

    const records = packRecords(originals, originalBodyEntry);
    const bodies = chapterBodies(originals, records);
    const perLanguage = {} as Record<ContentLanguages, number>;

    for (const language of Object.values(ContentLanguages)) {
      const rows = translated.filter((row) => row.language === language);
      const packed = packRecords(rows, (position) => translationBodyEntry(language, position));

      records.push(...packed);
      bodies.push(...chapterBodies(rows, packed));
      perLanguage[language] = rows.length;
    }

    const cover = coverOf(item);
    const bodyCount = records.filter((record) => record.file).length;
    const filename = `${slug(item.title) || item.id}-export.zip`;
    const manifest = this.manifest(item, records.length, bodyCount, perLanguage);

    const stored = await this.archive.writeTo(`${PACKAGE_PREFIX}/${itemId}.zip`, filename, async (into) => {
      await into.text(MANIFEST_ENTRY, json(manifest));
      await into.text(ITEM_ENTRY, json(itemRecord(item)));

      if (cover) {
        await into.image(coverEntry(cover.extension), cover.path);
      }

      await into.text(CONTENTS_ENTRY, json(records));
      await copy(into, bodies);
    });

    return {
      url: stored.url,
      filename,
      bytes: stored.bytes,
      contents: records.length,
      bodies: bodyCount,
      translations: perLanguage,
    };
  }

  private manifest(item: LibraryItem, contents: number, bodies: number, translations: Record<ContentLanguages, number>): PackageManifest {
    return {
      schema: PACKAGE_SCHEMA,
      kind: item.type,
      exportedAt: nowIso(),
      project: this.config.firebase.projectId,
      source: { itemId: item.id, title: item.title },
      counts: { contents, bodies, translations },
    };
  }

  /** The item, a novel, or the refusal each case owes. */
  private async require(itemId: string): Promise<LibraryItem> {
    const item = await this.repository.findLibrary(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_PACKAGEABLE);
    }

    return item;
  }
}

/**
 * The rows as the package states them, each numbered by its position in this array
 * rather than by its `idx`: nothing stops two rows sharing one, and two entries with
 * one name is a corrupt archive. `file` is what ties a record to its text, and null
 * where a row has none yet — a discovered chapter nobody has scraped is still worth
 * carrying.
 */
function packRecords(rows: TextContent[], entryFor: (position: number) => string): PackagedContent[] {
  return rows.map((row, at) => ({
    idx: row.idx,
    type: row.type,
    language: row.language,
    title: row.title,
    words: row.words,
    sourceUrl: row.sourceUrl,
    file: objectPathFrom(row.contentUrl ?? '') ? entryFor(at + 1) : null,
  }));
}

/** Each record with a file, paired with the object its text is actually in. */
function chapterBodies(rows: TextContent[], records: PackagedContent[]): PackagedBody[] {
  return records.flatMap((record, at) => {
    const path = objectPathFrom(rows[at]?.contentUrl ?? '');

    return record.file && path ? [{ entry: record.file, path }] : [];
  });
}

/** One at a time, deliberately: each waits for the upload, which is what bounds the memory. */
async function copy(into: ArchiveWriter, bodies: PackagedBody[]): Promise<void> {
  for (const body of bodies) {
    try {
      await into.object(body.entry, body.path);
    } catch (cause: unknown) {
      // A row pointing at an object that is not there is a row that is lying, and the
      // storage client's own "No such object" says nothing about which chapter. The
      // whole export fails rather than quietly writing an empty entry: an archive that
      // says it holds a chapter and does not is worse than one nobody got.
      throw new UnprocessableEntityException(`${body.entry} points at text that is not in storage. Re-scrape that chapter, or clear its content, and export again.`, { cause });
    }
  }
}

/**
 * The item as a `POST /library` body, so an import that creates one passes this
 * straight to `LibraryItemManager.create` — a field added to the entity is a field
 * the package carries without anything here changing.
 *
 * `coverUrl` is the exporting workspace's and is dead everywhere else. It is carried
 * because it says there *was* a cover; the bytes beside it are the real answer, and
 * neither is written on import. `downloadedCount` rides along too, though
 * `LibraryItemManager.create` never reads it off the body — it is recomputed there.
 */
function itemRecord(item: LibraryItem): CreateLibraryItemDto {
  return {
    type: item.type,
    title: item.title,
    status: item.status,
    sourceMode: item.sourceMode,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    coverUrl: item.coverUrl,
    novelMetadata: {
      discoveredCount: item.novelMetadata!.discoveredCount,
      discoveredAt: item.novelMetadata!.discoveredAt,
      downloadedCount: item.novelMetadata!.downloadedCount,
      status: item.novelMetadata!.status,
      author: item.novelMetadata!.author,
      language: item.novelMetadata!.language,
      genres: item.novelMetadata!.genres,
      description: item.novelMetadata!.description,
    },
  };
}

/** The cover's object and the extension to keep on it, or null where there is none. */
function coverOf(item: LibraryItem): { path: string, extension: string } | null {
  const path = item.coverUrl ? objectPathFrom(item.coverUrl) : null;

  if (!path) {
    return null;
  }

  const dot = path.lastIndexOf('.');

  return { path, extension: dot > 0 ? path.slice(dot).toLowerCase() : '' };
}

/** Indented, because a package is a thing people open and read. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A filename a person recognises. A title with nothing latin in it slugs to nothing — see the caller. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
