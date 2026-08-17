import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { objectPathFrom } from '../core/firebase/storage-url';
import { ArchiveProvider } from '../core/providers/archive.provider';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { LibraryPackageCheckDto, LibraryPackageReportDto } from './dto/library-package.dto';
import { LibraryItemType, NovelItem } from './entities/library-item.entity';
import { CHAPTERS_ENTRY, ITEM_ENTRY, MANIFEST_ENTRY, NOT_PACKAGEABLE, PACKAGE_SCHEMA, PackageCheckState, PackageManifest, PackagedChapter, PackagedTranslations, isCoverEntry, isPackageEntry, isRecordEntry, translationsEntryLanguage } from './entities/library-package.entity';
import { TRANSLATION_NAMES, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryRepository } from './library.repository';

/** What a package with nothing to read by is refused with. Its cause is logged, not shown. */
const NO_MANIFEST = `The package has no readable ${MANIFEST_ENTRY}`;

const NOT_OURS = 'That is not a package in this bucket';

/** How many skipped names the report spells out before it starts counting. */
const NAMED_SKIPS = 3;

/**
 * Everything a package says about itself, read without any of its text.
 *
 * `chapters` is null where there is no `chapters.json` at all, which is a broken
 * package — an empty array is a novel with no chapters, and the two are not the
 * same fact.
 */
export interface PackageRecords {
  manifest: PackageManifest;
  item: CreateLibraryItemDto | null;
  chapters: PackagedChapter[] | null;
  translations: PackagedTranslations;
  /** Entries the format does not know, left alone. */
  skipped: string[];
  cover: boolean;
}

/**
 * Reading a package, and saying what is in it.
 *
 * The pass below is the only way into an archive on this side, and it reads the
 * small half: the manifest, the item, and one records file per language. Every body
 * goes past undecompressed, which is what makes validation cheap enough to run twice
 * — once for the person, once for the endpoint that will not take their word for it.
 */
@Injectable()
export class LibraryImportManager {
  constructor(
    private readonly items: LibraryRepository,
    private readonly contents: LibraryContentManager,
    private readonly archive: ArchiveProvider,
  ) {}

  /** What the dialog draws before anything is written. Writes nothing, and is safe to call twice. */
  async validate(itemId: string, packageUrl: string): Promise<LibraryPackageReportDto> {
    const item = await this.require(itemId);
    const records = await this.read(packageUrl);
    const stored = await this.contents.chapters(itemId);

    return report(item, records, new Set(stored.map((chapter) => chapter.index)));
  }

  /**
   * The first pass: the records, and the names of everything else.
   *
   * `wanted` decides from the name alone because the reader cannot seek — see
   * `ArchiveProvider`. It also collects, which is what makes the report's `skipped`
   * free: an entry the format does not know is one nothing asked for.
   */
  async read(packageUrl: string): Promise<PackageRecords> {
    const path = this.pathOf(packageUrl);
    const found = new Map<string, Buffer>();
    const skipped: string[] = [];
    let cover = false;

    await this.archive.readFrom(path, (name) => {
      if (isCoverEntry(name)) {
        cover = true;
      } else if (!isPackageEntry(name)) {
        skipped.push(name);
      }

      return isRecordEntry(name);
    }, (name, body) => {
      found.set(name, body);

      return Promise.resolve();
    });

    const manifest = parse<PackageManifest>(found, MANIFEST_ENTRY);

    if (!manifest) {
      throw new BadRequestException(NO_MANIFEST);
    }

    return { manifest, item: parse(found, ITEM_ENTRY), chapters: parse(found, CHAPTERS_ENTRY), translations: translationsIn(found), skipped, cover };
  }

  /** The object a package URL names, or the refusal. Nothing outside this bucket is readable. */
  pathOf(packageUrl: string): string {
    const path = objectPathFrom(packageUrl);

    if (!path) {
      throw new BadRequestException(NOT_OURS);
    }

    return path;
  }

  /** The item, a novel, or the refusal each case owes. */
  async require(itemId: string): Promise<NovelItem> {
    const item = await this.items.findById(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_PACKAGEABLE);
    }

    return item;
  }
}

/** One records file per language the archive carried. A language it did not is absent, not empty. */
function translationsIn(found: Map<string, Buffer>): PackagedTranslations {
  const translations: PackagedTranslations = {};

  for (const name of found.keys()) {
    const language = translationsEntryLanguage(name);
    const records = language ? parse<PackagedChapter[]>(found, name) : null;

    if (language && records) {
      translations[language] = records;
    }
  }

  return translations;
}

function parse<T>(found: Map<string, Buffer>, name: string): T | null {
  const body = found.get(name);

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    // A record file that will not parse reads as one that is not there, and the
    // check built from it says so in the row it was going to fill.
    return null;
  }
}

/**
 * The mockup's five rows, each built from something actually read.
 *
 * `valid` is *no row failed*, so in practice only a broken or future-schema package
 * is refused: importing into the wrong book is worth showing in bold and not worth
 * refusing, since *"Import as new library item"* exists precisely for a package that
 * matches nothing.
 */
function report(item: NovelItem, records: PackageRecords, held: Set<number>): LibraryPackageReportDto {
  const chapters = records.chapters ?? [];
  const adding = chapters.filter((record) => !held.has(record.index)).length;

  const checks = [
    manifestCheck(records.manifest),
    metadataCheck(item, records),
    chaptersCheck(records.chapters, adding, chapters.length - adding),
    skippedCheck(records.skipped),
    ...translationChecks(records.translations),
  ].filter((check): check is LibraryPackageCheckDto => check !== null);

  return {
    valid: checks.every((check) => check.state !== PackageCheckState.Fail),
    checks,
    chapters: chapters.length,
    adding,
    existing: chapters.length - adding,
    skipped: records.skipped,
    translations: Object.entries(records.translations).map(([language, rows]) => ({ language: language as TranslationLanguage, translated: rows.length })),
  };
}

function manifestCheck(manifest: PackageManifest): LibraryPackageCheckDto {
  const label = `${MANIFEST_ENTRY} · schema v${manifest.schema}`;

  if (manifest.schema > PACKAGE_SCHEMA) {
    return { state: PackageCheckState.Fail, label, detail: `Written by a later workspace. This one reads v${PACKAGE_SCHEMA}.` };
  }

  if (manifest.kind !== LibraryItemType.Novel) {
    return { state: PackageCheckState.Fail, label, detail: `${NOT_PACKAGEABLE} — this one holds a ${manifest.kind} set.` };
  }

  return { state: PackageCheckState.Pass, label, detail: `Exported ${dateLabel(manifest.exportedAt)} from project ${manifest.project}` };
}

/**
 * A title that does not match is a **warning**, never a refusal: a re-exported item
 * that has since been renamed would otherwise be unimportable into itself.
 */
function metadataCheck(item: NovelItem, records: PackageRecords): LibraryPackageCheckDto {
  const label = 'Metadata record';

  if (!records.item) {
    return { state: PackageCheckState.Fail, label, detail: `No ${ITEM_ENTRY} in the package.` };
  }

  if (records.item.title !== item.title) {
    return { state: PackageCheckState.Warn, label, detail: `Describes “${records.item.title}” — this item is “${item.title}”` };
  }

  return { state: PackageCheckState.Pass, label, detail: `Title, author, genres${records.cover ? ', cover' : ''} · matches this item` };
}

function chaptersCheck(records: PackagedChapter[] | null, adding: number, existing: number): LibraryPackageCheckDto {
  if (!records) {
    return { state: PackageCheckState.Fail, label: 'Chapter records', detail: `No ${CHAPTERS_ENTRY} in the package.` };
  }

  return {
    state: PackageCheckState.Pass,
    label: `${records.length} chapter ${records.length === 1 ? 'file' : 'files'}`,
    detail: `${adding} not present in this item · ${existing} already stored`,
  };
}

/** Omitted where nothing was skipped: a row reading "0 files skipped" is a row saying nothing. */
function skippedCheck(skipped: string[]): LibraryPackageCheckDto | null {
  if (skipped.length === 0) {
    return null;
  }

  const named = skipped.slice(0, NAMED_SKIPS).join(', ');
  const rest = skipped.length - NAMED_SKIPS;

  return {
    state: PackageCheckState.Warn,
    label: `${skipped.length} ${skipped.length === 1 ? 'file' : 'files'} skipped`,
    detail: `${named}${rest > 0 ? ` and ${rest} more` : ''} — not part of the format`,
  };
}

function translationChecks(translations: PackagedTranslations): LibraryPackageCheckDto[] {
  return Object.entries(translations).map(([language, records]) => ({
    state: PackageCheckState.Pass,
    label: `Translations · ${TRANSLATION_NAMES[language as TranslationLanguage]}`,
    detail: `${records.length} ${records.length === 1 ? 'chapter' : 'chapters'}`,
  }));
}

/** "12 Aug 2026". A fixed locale, because this is prose the server writes and the client draws. */
function dateLabel(iso: string): string {
  const at = new Date(iso);

  return Number.isNaN(at.getTime()) ? 'on an unknown date' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
