import { LibraryItemType } from './library-item.entity';
import { TRANSLATION_LANGUAGES, TranslationLanguage } from './library-translation.entity';

/**
 * The `.zip` a library item packs into, and reads back from.
 *
 * ```
 * manifest.json                the schema version, when, from where, and the counts
 * item.json                    the item's writable representation — the POST /library body
 * cover.jpg                    only when the item has a cover. Read on import, never written
 * chapters.json                the chapter records, in reading order
 * chapters/0001.txt            one per chapter that has a body
 * translations/vi.json         the Vietnamese records
 * translations/vi/0001.txt     one per translated chapter that has a body
 * ```
 *
 * Every entry name is built by a function here and recognised by a matcher here, for
 * `TRANSLATION_SUBCOLLECTIONS`' reason: a name spelled in two files is a name that
 * eventually disagrees with itself. Nothing outside this file concatenates a path
 * inside an archive.
 */

/** The format's version. A package from a later one fails validation rather than being half-read. */
export const PACKAGE_SCHEMA = 1;

/** Both packaging routes refuse the same thing, so both refuse it in the same words. */
export const NOT_PACKAGEABLE = 'Only a novel can be packaged';

export const MANIFEST_ENTRY = 'manifest.json';

export const ITEM_ENTRY = 'item.json';

export const CHAPTERS_ENTRY = 'chapters.json';

const CHAPTER_FOLDER = 'chapters';

const TRANSLATION_FOLDER = 'translations';

/** How wide a body's number is written. For the human unzipping it; the machine reads `file`. */
const POSITION_WIDTH = 4;

const COVER = 'cover';

const BODY_SUFFIX = '.txt';

/** What a package says about itself. Read before anything else in it is trusted. */
export interface PackageManifest {
  schema: number;
  /** Only a novel is packaged. Here so a set's package is refused by reading one field. */
  kind: LibraryItemType;
  exportedAt: string;
  /** The Firebase project it came from — the mockup's "from workspace kms-media". */
  project: string;
  source: { itemId: string, title: string };
  counts: { chapters: number, bodies: number, translations: Record<string, number> };
}

/**
 * One chapter, as the package states it. A translation record is the same shape —
 * same reader, same writer — with `sourceUrl` always null, for the reason part 4
 * gives about a translation having no upstream address.
 */
export interface PackagedChapter {
  index: number;
  title: string;
  language: string;
  words: number;
  sourceUrl: string | null;
  /** The entry holding the text, or null where the chapter has none yet. */
  file: string | null;
}

/** Only a language the package actually carries gets a key. */
export type PackagedTranslations = Partial<Record<TranslationLanguage, PackagedChapter[]>>;

/** What to do with a chapter number the target already holds. The mockup's select, verbatim. */
export enum ImportConflict {
  Skip = 'skip',
  Overwrite = 'overwrite',
  NewItem = 'newItem',
}

/**
 * How one line of the validation report reads.
 *
 * A `Fail` is what stops an import; a `Warn` is drawn in bold and continued past —
 * the mockup's own footer says *"1 warning — you can continue."*
 */
export enum PackageCheckState {
  Pass = 'pass',
  Warn = 'warn',
  Fail = 'fail',
}

/** `cover.jpg`, or `cover` where the stored object has no extension to keep. */
export const coverEntry = (extension: string): string => `${COVER}${extension}`;

export const translationsEntry = (language: TranslationLanguage): string => `${TRANSLATION_FOLDER}/${language}.json`;

/** Numbered by the record's position, not its chapter number: two chapters may share a number. */
export const bodyEntry = (position: number): string => `${CHAPTER_FOLDER}/${padded(position)}${BODY_SUFFIX}`;

export const translationBodyEntry = (language: TranslationLanguage, position: number): string =>
  `${TRANSLATION_FOLDER}/${language}/${padded(position)}${BODY_SUFFIX}`;

/** The small entries: everything a first pass reads, and nothing that carries text. */
export const isRecordEntry = (name: string): boolean =>
  name === MANIFEST_ENTRY || name === ITEM_ENTRY || name === CHAPTERS_ENTRY || translationsEntryLanguage(name) !== null;

/** A chapter body or a translation of one. What the second pass reads. */
export const isBodyEntry = (name: string): boolean =>
  name.endsWith(BODY_SUFFIX) && (name.startsWith(`${CHAPTER_FOLDER}/`) || bodyEntryLanguage(name) !== null);

export const isCoverEntry = (name: string): boolean => name === COVER || name.startsWith(`${COVER}.`);

/** Whether the format knows this name at all. What is left over is the report's `skipped`. */
export const isPackageEntry = (name: string): boolean => isRecordEntry(name) || isBodyEntry(name) || isCoverEntry(name);

/** The language a `translations/vi.json` names, or null. One of three, never a string the archive supplied. */
export function translationsEntryLanguage(name: string): TranslationLanguage | null {
  return TRANSLATION_LANGUAGES.find((language) => name === translationsEntry(language)) ?? null;
}

/** The language a `translations/vi/0001.txt` is filed under, or null. */
export function bodyEntryLanguage(name: string): TranslationLanguage | null {
  return TRANSLATION_LANGUAGES.find((language) => name.startsWith(`${TRANSLATION_FOLDER}/${language}/`)) ?? null;
}

function padded(position: number): string {
  return String(position).padStart(POSITION_WIDTH, '0');
}
