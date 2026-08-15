/**
 * The live tree, as the Realtime Database holds it. Mirrored by hand from
 * `backend/src/core/providers/realtime.provider.ts` — there is no shared package yet,
 * and the same arrangement `types/library.ts` has with the DTOs.
 *
 * Nothing here is authoritative. It is a derived view of what the API already answers
 * with, published so a job that runs for hours is visible while it runs — see
 * `useScrapingJobs`.
 */

import type { LibraryItemType } from '~/types/library'
import type { ScrapingJobStatus } from '~/types/scraping-job'

/**
 * The item a job is over, under `library` on its node: which one, and what it holds.
 *
 * The item's rows, not the job's tasks: a job over chapters 1–20 knows nothing about
 * the other 1,285, and this is what the Library listing draws.
 *
 * Every field is optional because they arrive at different moments — the identity when
 * the job is recorded, the counters as chapters land — so a job that has not yet
 * fetched anything has a name here and no numbers.
 *
 * No status. An item's status is the person's — **Draft** or **Ready** — and the runner
 * never writes it. **Scraping** is drawn from there being a running job at all.
 */
export interface ScrapingItemStatus {
  id?: string
  type?: LibraryItemType
  /** As the item was called when the job was described. */
  title?: string
  /** Every row of the item. */
  total?: number
  completed?: number
  failed?: number
  /** Queued or in flight — what is still owed. Zero is what drained means. */
  pending?: number
}

/** One task, under `tasks` on the node. `index` saves the screen a lookup to name it. */
export interface RunningTask {
  status: ScrapingJobStatus
  index: number
}

/**
 * One job, under `scrapings/runningJobs/{jobId}`.
 *
 * Timestamps are epoch milliseconds here and ISO strings in the API: these are
 * compared and never displayed. `library` is absent until the first chapter lands,
 * and `tasks` until the job publishes — a booked job has neither.
 */
export interface RunningJob {
  id: string
  status: ScrapingJobStatus
  range: string
  refetch: boolean
  startAt?: number
  queuedAt?: number
  total: number
  completed: number
  failed: number
  /** Stamped on every write, so a node can be read as stale. */
  updatedAt: number
  library?: ScrapingItemStatus
  tasks?: Record<string, RunningTask>
}
