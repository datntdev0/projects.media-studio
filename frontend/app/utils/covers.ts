/**
 * Turning a picked file into the cover that gets uploaded.
 *
 * The file is not sent as it came off the disk: it is centre-cropped to the 3:4
 * every cover is drawn at and re-encoded as WebP, so a phone photo reaches the
 * bucket as tens of kilobytes rather than several megabytes.
 *
 * Both halves come back — the blob to upload, and a preview to draw while the
 * item is still being filled in.
 */

/** What the picker offers and what a drop is checked against. */
export const COVER_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif'

export const COVER_MAX_MB = 8

/** What every cover is stored as, whatever was picked. */
export const COVER_CONTENT_TYPE = 'image/webp'

const MAX_FILE_BYTES = COVER_MAX_MB * 1024 * 1024

/** A cover is drawn at 40–150px; this is generous for every place it appears. */
const COVER_WIDTH = 320

const COVER_HEIGHT = Math.round(COVER_WIDTH * 4 / 3)

const COVER_QUALITY = 0.7

/** A picked file, resized and waiting for the save that uploads it. */
export interface CoverDraft {
  blob: Blob
  /** A data URL rather than an object URL, so there is nothing to revoke. */
  preview: string
}

/**
 * Takes the picked file and hands back what to upload and what to show.
 *
 * Rejects with the sentence to print — the field shows it and keeps the cover
 * it already had.
 */
export async function prepareCover(file: File): Promise<CoverDraft> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Covers are capped at ${COVER_MAX_MB} MB.`)
  }

  const canvas = await resize(file)

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, COVER_CONTENT_TYPE, COVER_QUALITY))

  if (!blob) {
    throw new Error('Could not encode that image.')
  }

  return { blob, preview: canvas.toDataURL(COVER_CONTENT_TYPE, COVER_QUALITY) }
}

/** Centre-cropped to 3:4, the ratio every cover is drawn at. */
async function resize(file: File): Promise<HTMLCanvasElement> {
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

  return canvas
}
