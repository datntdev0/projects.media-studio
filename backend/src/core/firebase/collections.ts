/**
 * The Firestore collections, in one place — a name that appears in two files is
 * a name that eventually disagrees with itself.
 */

/** One document, `current`: what this deployment is and when it last started. */
export const SYSTEM_COLLECTION = 'system';

/** One document per row of the library listing — a novel, an image set, a video set. */
export const LIBRARY_COLLECTION = 'libraryItems';
