/**
 * The shape of the served URL space, in one place — the controllers, main.ts and
 * the docs all have to agree on it.
 *
 * Three tiers:
 *
 * - `/api/v1/…` — the API proper. Anything whose payload can change between
 *   versions lives here, and gets the version by default.
 * - `/api/system` — prefixed but version-neutral: which build is running is not
 *   a per-version question, so a client should not have to pick one to ask.
 * - `/health`, `/docs`, `/openapi.json` — outside the prefix entirely. Liveness
 *   is for orchestrators and the e2e readiness probe, and the docs describe
 *   every version rather than living inside one.
 */
export const API_PREFIX = 'api';

/** Default URI version. Controllers opt out with `VERSION_NEUTRAL`. */
export const API_VERSION = '1';

/** Version-neutral, inside the prefix. */
export const SYSTEM_PATH = 'system';

/** Unversioned liveness probe, outside the prefix. */
export const HEALTH_PATH = 'health';

/** Versioned. `/api/v1/auth/…` */
export const AUTH_PATH = 'auth';

/** The generated OpenAPI document. */
export const OPENAPI_JSON_PATH = 'openapi.json';

/** Where Swagger UI browses that document. */
export const DOCS_PATH = 'docs';
