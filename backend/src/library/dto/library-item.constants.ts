import { LibraryItemStatus } from "../entities/library-item.entity";

export const MAX_TITLE = 300;

export const MAX_SOURCE_NAME = 100;

export const MAX_URL = 2048;

export const MAX_SEARCH = 200;

export const DEFAULT_PAGE_SIZE = 20;

export const MAX_PAGE_SIZE = 100;

export const WRITABLE_STATUSES = [LibraryItemStatus.Draft, LibraryItemStatus.Ready];
