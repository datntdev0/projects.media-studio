/**
 * The live scraping status, as the Realtime Database holds it. Mirrored by hand from
 * `backend/src/core/providers/realtime.provider.ts` — there is no shared package yet,
 * and the same arrangement `types/library.ts` has with the DTOs.
 *
 * Nothing here is authoritative. It is a derived view of what the API already answers
 * with, published so a job that runs for hours is visible while it runs, and read only
 * while `status` is `scraping` — see `useScrapingStatus`.
 */

import type { LibraryContentStatus } from '~/types/library-content'
import type { LibraryItemStatus } from '~/types/library'

/** One item's summary, under `/scraping/items/{itemId}`. */
export interface ScrapingItemStatus {
  status: LibraryItemStatus
  /** Every row of the item. */
  total: number
  completed: number
  failed: number
  /** Queued or in flight — what is still owed. Zero is what drained means. */
  pending: number
  /** Epoch ms. Compared, never drawn. */
  updatedAt: number
}

/** One row, under `/scraping/contents/{itemId}/{contentId}`. Present only while a job runs. */
export interface ScrapingContentStatus {
  status: LibraryContentStatus
  /** The chapter number. Written when the job claimed the row; not what the table sorts on. */
  index: number
}
