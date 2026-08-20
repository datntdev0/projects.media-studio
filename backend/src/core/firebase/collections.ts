/**
 * The Firestore collections, in one place — a name that appears in two files is
 * a name that eventually disagrees with itself.
 */

/** One document, `current`: what this deployment is and when it last started. */
export const SYSTEM_COLLECTION = 'system';

/** One document per row of the library listing — a novel, an image set, a video set. */
export const LIBRARY_COLLECTION = 'libraryItems';

/** Under a library item: one document per chapter, image or clip it holds. */
export const CONTENT_SUBCOLLECTION = 'contents';

/**
 * Beside `contents`, one per language: `translation_vi`, `translation_en` and
 * `translation_zh`, each holding one document per translated chapter, keyed by
 * that chapter's own id. The map from a language to its name is
 * `TRANSLATION_SUBCOLLECTIONS`, which stays beside the enum it is keyed by — a
 * `Record<TranslationLanguage, …>` here would have `core` import from a feature.
 * `AUDIO_SUBCOLLECTIONS` stays beside its own enum for the same reason.
 */

/**
 * Beside `contents`: one document per illustrated chapter, keyed by that chapter's
 * own id. Language-free — a picture of a scene is the same picture whatever
 * language the scene is read in — so this one is a plain name and can live here.
 */
export const ILLUSTRATION_SUBCOLLECTION = 'illustration';

/** One document per scraping job — what was asked for, and where it has got to. */
export const SCRAPING_JOB_COLLECTION = 'scrapingJobs';

/** Under a scraping job: one document per piece of content it was asked to fetch. */
export const TASK_SUBCOLLECTION = 'tasks';
