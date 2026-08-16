/**
 * The live tree, as the Realtime Database holds it. Mirrored by hand from
 * `backend/src/core/providers/realtime.provider.ts` — there is no shared package yet,
 * and the same arrangement `types/library.ts` has with the DTOs.
 *
 * Nothing here is authoritative. It is a derived view of what the API already answers
 * with, published so a job that runs for hours is visible while it runs — see
 * `useScrapingJobs`.
 */

import type { ScrapingJobStatus } from '~/types/scraping-job'

/** One task, under `tasks` on the node. `index` saves the screen a lookup to name it. */
export interface RunningTask {
  status: ScrapingJobStatus
  index: number
}

/**
 * One job, under `scrapings/runningJobs/{jobId}`.
 *
 * Timestamps are epoch milliseconds here and ISO strings in the API: these are
 * compared and never displayed. The counters are the job's own tasks, never the item's
 * rows — the Library screens refetch for those.
 */
export interface RunningJob {
  id: string
  /** The item the job is over, so a Library screen can find the job running over it. */
  libraryId?: string
  status: ScrapingJobStatus
  range: string
  refetch: boolean
  startAt?: number
  queuedAt?: number
  total?: number
  completed?: number
  failed?: number
  /** Stamped on every write, so a node can be read as stale. */
  updatedAt: number
  tasks?: Record<string, RunningTask>
}
