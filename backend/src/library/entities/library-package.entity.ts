import { ContentLanguages, LibraryContentType } from './library-content.entity';
import { LibraryItemType } from './library-item.entity';

/**
 * The `.zip` a novel packs into.
 *
 * ```
 * manifest.json                     the schema version, when, from where, and the counts
 * item.json                         the item's writable representation — the POST /library body
 * cover.jpg                         only when the item has a cover. Read on import, never written
 * contents.json                     every text row — original and translation — in reading order
 * contents/original/0001.txt        one per original chapter that has a body
 * contents/translation/vi/0001.txt  one per Vietnamese translation that has a body
 * ```
 *
 * Every entry name is built by a function here, so nothing outside this file
 * concatenates a path inside an archive.
 */

/** The format's version. A package from a later one fails validation rather than being half-read. */
export const PACKAGE_SCHEMA = 1;

/** What packaging a set is refused for. */
export const NOT_PACKAGEABLE = 'Only a novel can be packaged';

export const MANIFEST_ENTRY = 'manifest.json';

export const ITEM_ENTRY = 'item.json';

export const CONTENTS_ENTRY = 'contents.json';

const CONTENT_FOLDER = 'contents';

const ORIGINAL_FOLDER = 'original';

const TRANSLATION_FOLDER = 'translation';

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
  counts: { contents: number, bodies: number, translations: Record<ContentLanguages, number> };
}

/** One text row — an original chapter or a translation of one — as the package states it. */
export interface PackagedContent {
  idx: number;
  type: LibraryContentType.Original | LibraryContentType.Translation;
  language: ContentLanguages;
  title: string;
  words: number;
  sourceUrl: string | null;
  /** The entry holding the text, or null where the row has none yet. */
  file: string | null;
}

/** `cover.jpg`, or `cover` where the stored object has no extension to keep. */
export const coverEntry = (extension: string): string => `${COVER}${extension}`;

/** Numbered by the row's position among originals, not its `idx`: two rows may share one. */
export const originalBodyEntry = (position: number): string => `${CONTENT_FOLDER}/${ORIGINAL_FOLDER}/${padded(position)}${BODY_SUFFIX}`;

export const translationBodyEntry = (language: ContentLanguages, position: number): string =>
  `${CONTENT_FOLDER}/${TRANSLATION_FOLDER}/${language}/${padded(position)}${BODY_SUFFIX}`;

function padded(position: number): string {
  return String(position).padStart(POSITION_WIDTH, '0');
}
