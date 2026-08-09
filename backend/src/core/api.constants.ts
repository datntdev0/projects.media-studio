/**
 * The shape of the served URL space, in one place — main.ts, the health
 * controller's opt-out and the docs all have to agree on it.
 *
 * The API is prefixed and versioned: `/api/v1/...`. Two things deliberately sit
 * outside that space, because neither belongs to a version of the API:
 * `/health`, which orchestrators and the e2e runner probe for liveness, and the
 * docs, which describe every version rather than living inside one.
 */
export const API_PREFIX = 'api';

/** Default URI version. Controllers opt out with `VERSION_NEUTRAL`. */
export const API_VERSION = '1';

/** Unversioned liveness probe. */
export const HEALTH_PATH = 'health';

/** The generated OpenAPI document. */
export const OPENAPI_JSON_PATH = 'openapi.json';

/** Where Swagger UI browses that document. */
export const DOCS_PATH = 'docs';
