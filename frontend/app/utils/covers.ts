/**
 * The cover "upload" behind `AppLibraryCoverField` — mocked, and client-side
 * only.
 *
 * There is no Cloud Storage yet, so the picked file is resized in a canvas and
 * handed back as a `data:` URL. That keeps `coverUrl` a plain URL string, which
 * is what the API takes and what a crawler-fetched cover already is — so when
 * storage arrives, only the body of `uploadCover` changes and nothing above it
 * moves. The resize is what makes it safe to store: a 3:4 WebP at this width is
 * tens of kilobytes, nowhere near Firestore's 1 MiB document limit.
 */

/** What the picker offers and what a drop is checked against. */
export const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif'

export const COVER_MAX_MB = 8

const MAX_FILE_BYTES = COVER_MAX_MB * 1024 * 1024

/** A cover is drawn at 40–150px; this is generous for every place it appears. */
const COVER_WIDTH = 320

const COVER_HEIGHT = Math.round(COVER_WIDTH * 4 / 3)

const COVER_QUALITY = 0.7

/** Refuse anything that would bloat the document, however it got this big. */
const MAX_ENCODED_BYTES = 200 * 1024

/** Long enough to read as an upload rather than a redraw. */
const UPLOAD_DELAY = 500

/**
 * Takes the picked file and hands back the URL to store.
 *
 * Rejects with the sentence to show — the field prints it and keeps the cover
 * it already had.
 */
export async function uploadCover(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Covers are capped at ${COVER_MAX_MB} MB.`)
  }

  await new Promise(resolve => setTimeout(resolve, UPLOAD_DELAY))

  const encoded = await resize(file)

  if (encoded.length > MAX_ENCODED_BYTES) {
    throw new Error('That image will not compress small enough. Try another one.')
  }

  return encoded
}

/** Centre-cropped to 3:4, the ratio every cover is drawn at. */
async function resize(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null)

  if (!bitmap) {
    throw new Error('Could not read that image.')
  }

  const canvas = document.createElement('canvas')

  canvas.width = COVER_WIDTH
  canvas.height = COVER_HEIGHT

  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()

    throw new Error('This browser cannot resize the image.')
  }

  // Scale to cover, then centre what does not fit — the same crop the listing's
  // `object-cover` would make, done once here instead of on every draw.
  const scale = Math.max(COVER_WIDTH / bitmap.width, COVER_HEIGHT / bitmap.height)
  const width = bitmap.width * scale
  const height = bitmap.height * scale

  context.drawImage(bitmap, (COVER_WIDTH - width) / 2, (COVER_HEIGHT - height) / 2, width, height)
  bitmap.close()

  return canvas.toDataURL('image/webp', COVER_QUALITY)
}
