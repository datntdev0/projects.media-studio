/** The path characters Windows reserves — none of them may reach a file name. */
const RESERVED_FILENAME_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/** Everything below this code point is a C0 control character, which is no more welcome in a file name. */
const LAST_CONTROL_CODE_POINT = 0x1f;

/** Long titles exist; file systems still cap a name. Leaves room for a prefix and an extension. */
const MAX_SLUG_LENGTH = 80;

function isNameSafe(char: string): boolean {
  return !RESERVED_FILENAME_CHARS.has(char) && (char.codePointAt(0) ?? 0) > LAST_CONTROL_CODE_POINT;
}

/**
 * A title reduced to something a file system will accept, keeping the characters it can —
 * a Chinese or Vietnamese title stays readable rather than being stripped to nothing by an
 * ASCII-only slug. Reserved and control characters are dropped outright, then what whitespace
 * is left folds into dashes. Falls back to `fallback` when a title contributes no usable character.
 */
export function fileSlug(title: string, fallback: string): string {
  const cleaned = [...title]
    .filter(isNameSafe)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_SLUG_LENGTH);

  return cleaned || fallback;
}
