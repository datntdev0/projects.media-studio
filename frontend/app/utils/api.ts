/**
 * What went wrong, in words written for a person.
 *
 * Our API answers a refused request with a message that already reads as a
 * sentence — Nest's `ValidationPipe` sends an array of them — so prefer it over a
 * status code the reader would have to interpret. The fallback is per caller,
 * because "could not save" and "could not delete" are not the same sentence.
 */
export function apiMessage(cause: unknown, fallback: string): string {
  const message = (cause as { data?: { message?: string | string[] } }).data?.message

  if (Array.isArray(message)) {
    return message[0] ?? fallback
  }

  return message ?? fallback
}
