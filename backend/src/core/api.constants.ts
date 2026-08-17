/**
 * The shape of the served URL space, in one place — the controllers, main.ts and
 * the docs all have to agree on it.
 *
 * Two tiers:
 *
 * - `/api/v1/…` — the API proper. Anything whose payload can change between
 *   versions lives here, and gets the version by default.
 * - `/system`, `/health`, `/docs`, `/openapi.json` — outside the prefix and the
 *   version entirely. What the service is and whether it is alive are not
 *   per-version questions, so a client should not have to pick a version to
 *   ask; the docs describe every version rather than living inside one.
 */
export const API_PREFIX = 'api';

/** Default URI version. Controllers opt out with `VERSION_NEUTRAL`. */
export const API_VERSION = '1';

/** Unversioned service information, outside the prefix. */
export const SYSTEM_PATH = 'system';

/** Unversioned liveness probe, outside the prefix. */
export const HEALTH_PATH = 'health';

/** Versioned. `/api/v1/auth/…` */
export const AUTH_PATH = 'auth';

/** Versioned. `/api/v1/library/…` */
export const LIBRARY_PATH = 'library';

/** Under an item. `/api/v1/library/:itemId/contents/…` */
export const LIBRARY_CONTENT_PATH = 'contents';

/** Under an item. `/api/v1/library/:id/export` — the item packed into a .zip. */
export const LIBRARY_EXPORT_PATH = 'export';

/** Under an item. `/api/v1/library/:id/import` and `/import/validate`. */
export const LIBRARY_IMPORT_PATH = 'import';

/** Versioned. `/api/v1/scrapings/…` */
export const SCRAPING_PATH = 'scrapings';

/** Under scraping. `/api/v1/scrapings/jobs/…` */
export const SCRAPING_JOBS_PATH = 'jobs';

/** The generated OpenAPI document. */
export const OPENAPI_JSON_PATH = 'openapi.json';

/** Where Swagger UI browses that document. */
export const DOCS_PATH = 'docs';
