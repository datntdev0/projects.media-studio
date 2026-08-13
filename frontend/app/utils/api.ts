import { ApiException } from './api.clients'

/**
 * What went wrong, in words written for a person.
 *
 * Our API answers a refused request with a message that already reads as a
 * sentence — Nest's `ValidationPipe` sends an array of them — so prefer it over a
 * status code the reader would have to interpret. The fallback is per caller,
 * because "could not save" and "could not delete" are not the same sentence.
 */
export function apiMessage(cause: unknown, fallback: string): string {
  const message = serverMessage(cause)

  if (Array.isArray(message)) {
    return message[0] ?? fallback
  }

  return message ?? fallback
}

/**
 * The `message` the API sent, dug out of however the failure reached us.
 *
 * Not `ApiException.message`: that is the operation's documented description,
 * written for whoever is reading the docs rather than for whoever hit the error.
 * The sentence about *this* request is in the body, which the generated client
 * hands over as the text it did not parse.
 */
function serverMessage(cause: unknown): string | string[] | undefined {
  if (cause instanceof ApiException) {
    try {
      return (JSON.parse(cause.response) as { message?: string | string[] }).message
    } catch {
      // A body that is not our error shape — a proxy's HTML, or nothing at all.
      return undefined
    }
  }

  // Anything still on `$fetch`, which parses the body for us.
  return (cause as { data?: { message?: string | string[] } }).data?.message
}
