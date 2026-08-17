import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../core/config/app-config.service';
import { objectPathFrom } from '../core/firebase/storage-url';
import { ArchiveProvider, ArchiveWriter } from '../core/providers/archive.provider';
import { nowIso } from '../_shared/helper';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { LibraryPackageDto } from './dto/library-package.dto';
import { NovelChapter } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType, NovelItem } from './entities/library-item.entity';
import { CHAPTERS_ENTRY, ITEM_ENTRY, MANIFEST_ENTRY, PACKAGE_SCHEMA, PackageManifest, PackagedChapter, bodyEntry, coverEntry, translationBodyEntry, translationsEntry } from './entities/library-package.entity';
import { TRANSLATION_LANGUAGES, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryTranslationRepository } from './library-translation.repository';
import { LibraryRepository } from './library.repository';

/** Where a packed item is filed, beside `content/{itemId}/` and `covers/{itemId}/`. */
const PACKAGE_PREFIX = 'packages';

/** Both refusals are the same fact: a set's package is its bytes, which is a different part. */
const NOT_A_NOVEL = 'Only a novel can be packaged';

/** One entry that has to be copied out of the bucket: where it goes, and where it comes from. */
interface PackagedBody {
  entry: string;
  path: string;
}

/** One language's half of the archive. */
interface PackagedLanguage {
  language: TranslationLanguage;
  records: PackagedChapter[];
  bodies: PackagedBody[];
}

/**
 * A novel, packed into a `.zip` in the bucket.
 *
 * Reads and nothing else — no Firestore write happens here, which is what makes a
 * failed export an incomplete object nobody was given the URL of rather than a
 * half-changed item. Everything is worked out before the archive is opened, so the
 * manifest can state the counts and the entries can be written in reading order.
 */
@Injectable()
export class LibraryExportManager {
  constructor(
    private readonly items: LibraryRepository,
    private readonly contents: LibraryContentManager,
    private readonly translations: LibraryTranslationRepository,
    private readonly archive: ArchiveProvider,
    private readonly config: AppConfigService,
  ) {}

  async export(itemId: string): Promise<LibraryPackageDto> {
    const item = await this.require(itemId);
    const chapters = await this.contents.chapters(itemId);
    const records = chapterRecords(chapters);
    const counted = await this.translations.counts(itemId);
    const languages = await this.packLanguages(itemId, chapters, counted);
    const cover = coverOf(item);

    const bodies = records.filter((record) => record.file).length;
    const filename = `${slug(item.title) || item.id}-export.zip`;
    const manifest = this.manifest(item, records.length, bodies, languages);

    const stored = await this.archive.writeTo(`${PACKAGE_PREFIX}/${itemId}/${randomUUID()}.zip`, filename, async (into) => {
      await into.text(MANIFEST_ENTRY, json(manifest));
      await into.text(ITEM_ENTRY, json(itemRecord(item)));

      if (cover) {
        await into.image(coverEntry(cover.extension), cover.path);
      }

      await into.text(CHAPTERS_ENTRY, json(records));
      await copy(into, chapterBodies(chapters, records));

      for (const packed of languages) {
        await into.text(translationsEntry(packed.language), json(packed.records));
        await copy(into, packed.bodies);
      }
    });

    return {
      url: stored.url,
      filename,
      bytes: stored.bytes,
      chapters: records.length,
      bodies,
      translations: TRANSLATION_LANGUAGES.map((language) => ({ language, translated: counted[language] })),
    };
  }

  /**
   * One language per subcollection that holds anything. A language nobody has
   * translated into gets no records file and no folder: three empty arrays in every
   * package would be three entries saying nothing the coverage rows do not.
   */
  private async packLanguages(itemId: string, chapters: NovelChapter[], counted: Record<TranslationLanguage, number>): Promise<PackagedLanguage[]> {
    const packed: PackagedLanguage[] = [];

    for (const language of TRANSLATION_LANGUAGES) {
      if (counted[language] === 0) {
        continue;
      }

      const stored = await this.translations.findByIds(itemId, language, chapters.map((chapter) => chapter.id));
      // The source's number, not the translation's stored copy: part 4 answers with
      // the source's `index` on every read, and a package should say what a read says.
      const translated = chapters.flatMap((chapter) => {
        const row = stored.get(chapter.id);

        return row ? [{ ...row, index: chapter.index }] : [];
      });

      const records = chapterRecords(translated, (position) => translationBodyEntry(language, position));

      packed.push({ language, records, bodies: chapterBodies(translated, records) });
    }

    return packed;
  }

  private manifest(item: NovelItem, chapters: number, bodies: number, languages: PackagedLanguage[]): PackageManifest {
    return {
      schema: PACKAGE_SCHEMA,
      kind: item.type,
      exportedAt: nowIso(),
      project: this.config.firebase.projectId,
      source: { itemId: item.id, title: item.title },
      counts: {
        chapters,
        bodies,
        translations: Object.fromEntries(languages.map((packed) => [packed.language, packed.records.length])),
      },
    };
  }

  /** The item, a novel, or the refusal each case owes. */
  private async require(itemId: string): Promise<NovelItem> {
    const item = await this.items.findById(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_A_NOVEL);
    }

    return item;
  }
}

/**
 * The chapters as the package states them.
 *
 * A body's entry is numbered by the record's **position**, not by its chapter number:
 * nothing stops two chapters sharing a number, and two entries with one name is a
 * corrupt archive. `file` is what ties a record to its text, and null where a chapter
 * has none — a discovered chapter nobody has scraped is still worth carrying.
 */
function chapterRecords(chapters: NovelChapter[], entryFor: (position: number) => string = bodyEntry): PackagedChapter[] {
  return chapters.map((chapter, at) => ({
    index: chapter.index,
    title: chapter.title,
    language: chapter.language,
    words: chapter.words,
    sourceUrl: chapter.sourceUrl,
    file: objectPathFrom(chapter.contentUrl ?? '') ? entryFor(at + 1) : null,
  }));
}

/** Each record with a file, paired with the object its text is actually in. */
function chapterBodies(chapters: NovelChapter[], records: PackagedChapter[]): PackagedBody[] {
  return records.flatMap((record, at) => {
    const path = objectPathFrom(chapters[at]?.contentUrl ?? '');

    return record.file && path ? [{ entry: record.file, path }] : [];
  });
}

/** One at a time, deliberately: each waits for the upload, which is what bounds the memory. */
async function copy(into: ArchiveWriter, bodies: PackagedBody[]): Promise<void> {
  for (const body of bodies) {
    await into.object(body.entry, body.path);
  }
}

/**
 * The item as a `POST /library` body, so an import that creates one passes this
 * straight to `LibraryManager.create` — a field added to an item is a field the
 * package carries without anything here changing.
 *
 * `coverUrl` is the exporting workspace's and is dead everywhere else. It is carried
 * because it says there *was* a cover; the bytes beside it are the real answer, and
 * neither is written on import.
 */
function itemRecord(item: NovelItem): CreateLibraryItemDto {
  return {
    type: item.type,
    title: item.title,
    coverUrl: item.coverUrl,
    sourceMode: item.sourceMode,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    metadata: {
      discoveredCount: item.metadata.discoveredCount,
      discoveredAt: item.metadata.discoveredAt,
      status: item.metadata.status,
      author: item.metadata.author,
      language: item.metadata.language,
      genres: item.metadata.genres,
      description: item.metadata.description,
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
