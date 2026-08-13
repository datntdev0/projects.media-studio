/**
 * How long each field may be. Shared by the creation and the update body, which
 * describe the same fields — kept here so the two cannot drift apart.
 *
 * Only the root's fields appear: what is inside `metadata` is checked by the
 * classes derived in `library-item.dto.ts`, which carry no length rules.
 */

export const MAX_TITLE = 300;

export const MAX_SOURCE_NAME = 100;

export const MAX_URL = 2048;
