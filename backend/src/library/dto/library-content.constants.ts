import { ContentLanguages, LibraryContentStatus, LibraryContentType } from "../entities/library-content.entity";

export const MAX_SEARCH = 200;

export const DEFAULT_PAGE_SIZE = 50;

export const MAX_PAGE_SIZE = 200;

export const LANGUAGES = Object.values(ContentLanguages);

export const CONTENT_TYPES = Object.values(LibraryContentType);

export const MAX_TITLE = 300;

export const MAX_FILENAME = 300;

export const MAX_LANGUAGE = 32;

export const MAX_URL = 2048;

export const MAX_INDEX = 1_000_000;

/** `discovered`, `inprogress` and `failed` are discovery's and the job runner's to set. */
export const WRITABLE_CONTENT_STATUSES = [LibraryContentStatus.Pending, LibraryContentStatus.Completed];