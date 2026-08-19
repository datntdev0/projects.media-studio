import { LibraryPackageCheckDto, LibraryPackageReportDto } from './dto/library-package.dto';
import { LibraryItemType, NovelItem } from './entities/library-item.entity';
import { CHAPTERS_ENTRY, ITEM_ENTRY, MANIFEST_ENTRY, NOT_PACKAGEABLE, PACKAGE_SCHEMA, PackageCheckState, PackageManifest, PackagedChapter } from './entities/library-package.entity';
import { TRANSLATION_NAMES, TranslationLanguage } from './entities/library-translation.entity';
// `import type`: this file is the manager's report, and holds nothing of it at runtime.
import type { PackageRecords } from './library-import.manager';

/** How many skipped names the report spells out before it starts counting. */
const NAMED_SKIPS = 3;

/**
 * What a package holds, said in the five rows the mockup draws — a badge, a bold line
 * and a muted one each, every one built from something actually read.
 *
 * Its own file because it is prose rather than rules: the manager decides what a
 * package *is*, and this decides how to say so. Together they would put
 * `library-import.manager.ts` well past the file-length line.
 */
export function report(item: NovelItem, records: PackageRecords, held: Set<number>): LibraryPackageReportDto {
  const chapters = records.chapters ?? [];
  const adding = chapters.filter((record) => !held.has(record.index)).length;

  const checks = [
    manifestCheck(records.manifest),
    metadataCheck(item, records),
    chaptersCheck(records.chapters, adding, chapters.length - adding),
    skippedCheck(records.skipped),
    ...translationChecks(records),
  ].filter((check): check is LibraryPackageCheckDto => check !== null);

  return {
    // No row failed. In practice only a broken or future-schema package is refused:
    // importing into the wrong book is worth showing in bold and not worth refusing,
    // since "Import as new library item" exists for a package that matches nothing.
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
    detail: `${adding} new · ${existing} matched, for the conflict policy to decide`,
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

function translationChecks(records: PackageRecords): LibraryPackageCheckDto[] {
  return Object.entries(records.translations).map(([language, rows]) => ({
    state: PackageCheckState.Pass,
    label: `Translations · ${TRANSLATION_NAMES[language as TranslationLanguage]}`,
    detail: `${rows.length} ${rows.length === 1 ? 'chapter' : 'chapters'}`,
  }));
}

/** "12 Aug 2026". A fixed locale, because this is prose the server writes and the client draws. */
function dateLabel(iso: string): string {
  const at = new Date(iso);

  return Number.isNaN(at.getTime()) ? 'on an unknown date' : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
