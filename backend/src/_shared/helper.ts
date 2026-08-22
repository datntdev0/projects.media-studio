import { Timestamp } from 'firebase-admin/firestore';

/** Every character range whose script is written without spaces, so words cannot be counted by them. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

export function nowIso(): string {
  return new Date().toISOString();
}

/** A Firestore timestamp, as the wire format every entity answers with. */
export function iso(at: Timestamp): string {
  return at.toDate().toISOString();
}

/**
 * How long a body runs. Whitespace-separated, and counted by character where the
 * script is written without spaces — the only crawler reads `zh`.
 *
 * The frontend's helper in `app/utils/library-content.ts` agrees with this, and
 * neither agrees with anything linguistic.
 */
export function wordCount(text: string): number {
  const unspaced = text.match(UNSPACED_SCRIPT)?.length ?? 0;
  const rest = text.replace(UNSPACED_SCRIPT, ' ').trim();

  return unspaced + (rest ? rest.split(/\s+/).length : 0);
}
