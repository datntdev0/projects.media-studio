// Types and IPC contract for the library package — the `.zip` a library item
// exports to and imports from. The archive is the interchange format between
// workspaces, and what the standalone scraping script (see
// src/scripts/scrape.py) writes, so its layout is fixed here rather than left
// implicit in the writer:
//
//   library.<slug>.zip
//   ├── library.json            the manifest below
//   ├── cover.<ext>             the cover image, when the item has one
//   └── chapters/
//       ├── chapter-0001.txt    one chapter body per file, named by `idx`
//       └── chapter-0002.txt
//
// Only a novel's original chapters travel — translations are not packaged.

import type { AppLibraryType, NovelDetails } from './app-library';
import type { AppLibraryContentStatus, ContentLanguage } from './app-library-content';

/**
 * Bumped when the archive layout changes in a way an older reader cannot handle. A package
 * written at a lower schema still reads: 2 dropped the source-provenance fields (the library's
 * source mode/name/URL and a chapter's own URL) that the app no longer stores, and a reader
 * simply ignores them where an older package still carries them.
 */
export const LIBRARY_PACKAGE_SCHEMA = 2;

/** Where `library.json` lives in the archive, and where chapter bodies go. */
export const LIBRARY_PACKAGE_MANIFEST = 'library.json';
export const LIBRARY_PACKAGE_CHAPTERS_DIR = 'chapters';

/** One chapter's entry in the manifest. `file` is null for a chapter that was discovered but never fetched. */
export interface LibraryPackageChapter {
  idx: number;
  title: string;
  language: ContentLanguage;
  status: AppLibraryContentStatus;
  file: string | null;
}

/** The item itself, as `library.json` records it — the stored `AppLibrary` minus the ids, counters and stamps the importing workspace stamps for itself. */
export interface LibraryPackageItem {
  title: string;
  type: AppLibraryType;
  /** The cover's file name inside the archive, or null when the item has no cover. */
  cover: string | null;
  novel: NovelDetails | null;
}

/** `library.json` in full. */
export interface LibraryPackageManifest {
  schema: number;
  exportedAt: string;
  library: LibraryPackageItem;
  chapters: LibraryPackageChapter[];
}

/** What inspecting an archive reports back before anything is written — enough for the import dialog's confirmation step. */
export interface LibraryPackagePreview {
  title: string;
  type: AppLibraryType;
  author: string | null;
  language: string | null;
  /** The synopsis, or null when the package carries none. May run to several paragraphs. */
  description: string | null;
  /**
   * The cover as a `data:` URL, ready to drop straight into an `<img src>`, or null when the
   * archive carries no cover. Inlined rather than written to disk because nothing has been
   * imported yet — the preview must not leave a file behind for an import the user may cancel.
   */
  cover: string | null;
  chapterCount: number;
  /** Chapters that actually carry a body — the rest import as placeholders with no text. */
  bodyCount: number;
}

export const APP_LIBRARY_PACKAGE_IPC_CHANNELS = {
  exportZip: 'app-library-package:export-zip',
  inspect: 'app-library-package:inspect',
  import: 'app-library-package:import',
} as const;

export interface AppLibraryPackageApi {
  /** Packages an item and asks where to save it. Resolves to the written path, or null when the save dialog was dismissed. */
  exportZip(libraryId: string): Promise<string | null>;
  /** Reads an archive's manifest and reports what importing it would create, writing nothing. Throws when the archive is not a library package. */
  inspect(data: ArrayBuffer): Promise<LibraryPackagePreview>;
  /** Creates a new library item from an archive, along with its chapters and cover. Returns the new item's id. */
  import(data: ArrayBuffer): Promise<string>;
}
