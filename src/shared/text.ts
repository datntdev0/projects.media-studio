// Plain text helpers — no Node/DOM APIs — shared by main and renderer, since a
// chapter's word count is computed both when the app itself saves an edit
// (renderer) and when an imported package brings its chapters in (main).

// CJK ideographs (plus the compatibility and extension-A blocks) — a script with
// no spaces between words, so a whitespace split would undercount it wildly. Each
// character is counted as its own word instead, matching how a Chinese source
// reports a chapter's length (word count by character).
const CJK_CHARACTER = /[一-鿿㐀-䶿豈-﫿]/g;

/** A body's word count — CJK characters counted one by one, everything else split on whitespace. */
export function countWords(body: string): number {
  const trimmed = body.trim();
  if (trimmed === '') return 0;

  const cjkCount = trimmed.match(CJK_CHARACTER)?.length ?? 0;
  const rest = trimmed.replace(CJK_CHARACTER, ' ').trim();
  const restCount = rest === '' ? 0 : rest.split(/\s+/).length;

  return cjkCount + restCount;
}
