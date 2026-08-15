/**
 * The job API's shapes, mirrored by hand — there is no shared package yet. Names and
 * field order follow `backend/src/scraping/dto/scraping-job.dto.ts` so drift is easy
 * to spot, which is the arrangement `types/library.ts` already has.
 */

import type { LibraryItemType } from '~/types/library'

/** Where a job — or one task of it — has got to. One vocabulary for both. */
export type ScrapingJobStatus = 'scheduled' | 'queued' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

/** The three tabs, each a group of statuses the endpoint knows by name. */
export type ScrapingJobTab = 'active' | 'scheduled' | 'history'

/** One piece of content the job was asked to fetch. */
export interface ScrapingTask {
  id: string
  contentId: string
  libraryId: string
  /** The chapter number — what the list is ordered by. */
  index: number
  sourceUrl: string
  status: ScrapingJobStatus
  refetch: boolean
  retry: number
  startAt: string | null
  completedAt: string | null
  /** The last failure, in one line. */
  error: string | null
}

/**
 * What was asked for, and where it has got to.
 *
 * `libraryTitle` and `libraryType` are the item as it was when the job was described,
 * so a card names what was scraped rather than what the item is called now.
 */
export interface ScrapingJob {
  id: string
  libraryId: string
  libraryType: LibraryItemType
  libraryTitle: string
  crawler: string
  status: ScrapingJobStatus
  /** The expression as it was sent — `all`, `missing`, `23-34`. Drawn verbatim. */
  range: string
  refetch: boolean
  retry: number
  startAt: string | null
  queuedAt: string | null
  completedAt: string | null
  total: number
  completed: number
  failed: number
  skipped: number
  createdAt: string
  updatedAt: string
  tasks: ScrapingTask[]
}

/** One page of the listing, and enough to draw the counts and the pager around it. */
export interface ScrapingJobPage {
  items: ScrapingJob[]
  total: number
  page: number
  pageSize: number
}

/**
 * The filter as the screen holds it. `all` is the screen's word for "do not narrow
 * on this", and never reaches the request — the query drops the key instead.
 */
export interface ScrapingJobFilters {
  tab: ScrapingJobTab
  libraryType: LibraryItemType | 'all'
  page: number
}
