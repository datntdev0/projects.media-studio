import type { BadgeProps } from '@nuxt/ui'
import type { LibraryFilterOption } from '~/types/library'
import type { ScrapingJob, ScrapingJobFilters, ScrapingJobPage, ScrapingJobStatus, ScrapingJobTab } from '~/types/scraping-job'
import type { ScrapingJobPageDto } from './api.clients'

/**
 * How a job reads on screen — the labels the card and the panel share, and the two
 * figures neither the record nor the API carries.
 *
 * Rate and ETA are computed here, from `queuedAt` and `completed`: a naive average
 * over the whole run. Nothing is stored and nothing is sampled, so a job that was
 * paused for an hour reads as very slow until it has run for a while again.
 */

/** A generated page, read as the hand-mirrored shape everything below narrows on. */
export const asScrapingJobPage = (page: ScrapingJobPageDto): ScrapingJobPage => page as unknown as ScrapingJobPage

/** Until step 5 the three controls have nothing behind them. */
export const JOB_CONTROLS_DEFERRED = 'Pause, resume and cancel arrive with the job controls.'

const MINUTE = 60_000

/**
 * The status tag. The same mono scheme the library's uses, so the seven are told
 * apart by weight rather than by colour — `--color-danger` is for destructive
 * actions and nothing else.
 */
const STATUS_TAGS: Record<ScrapingJobStatus, { label: string, color: BadgeProps['color'], variant: BadgeProps['variant'] }> = {
  scheduled: { label: 'Scheduled', color: 'neutral', variant: 'subtle' },
  queued: { label: 'Queued', color: 'neutral', variant: 'subtle' },
  running: { label: 'Running', color: 'primary', variant: 'solid' },
  paused: { label: 'Paused', color: 'neutral', variant: 'outline' },
  stopped: { label: 'Stopped', color: 'neutral', variant: 'outline' },
  completed: { label: 'Completed', color: 'primary', variant: 'subtle' },
  failed: { label: 'Failed', color: 'neutral', variant: 'outline' }
}

/** The three a job settles in and never leaves — what the History tab lists. */
const TERMINAL: ScrapingJobStatus[] = ['stopped', 'completed', 'failed']

export const jobStatusTag = (status: ScrapingJobStatus) => STATUS_TAGS[status]

export const jobSettled = (job: ScrapingJob): boolean => TERMINAL.includes(job.status)

/** How much of the job is done, 0–100. Zero for a job of nothing, so the bar starts empty. */
export function jobProgressPercent(job: ScrapingJob): number {
  return job.total > 0 ? Math.min(100, Math.round(((job.completed + job.failed) / job.total) * 100)) : 0
}

/** `412 / 640 chapters` — what the card draws right-aligned beside its bar. */
export function jobProgressLabel(job: ScrapingJob): string {
  return `${countLabel(job.completed)} / ${countLabel(job.total)} ${contentNoun(job.libraryType)}`
}

/** The line under the title: where it came from, how much of it, and what was left out. */
export function jobMeta(job: ScrapingJob): string {
  const parts = [job.crawler, `${countLabel(job.total)} ${contentNoun(job.libraryType)}`]

  if (job.skipped) {
    parts.push(`${countLabel(job.skipped)} skipped`)
  }

  if (job.failed) {
    parts.push(`${countLabel(job.failed)} failed`)
  }

  return parts.join(' · ')
}

/**
 * `38 / min`, or a dash where there is nothing to average yet.
 *
 * A decimal while the number is small, as `bytesLabel` does it: rounding 0.2 up to
 * `1 / min` would read as a job keeping pace when it has nearly stalled.
 */
export function jobRate(job: ScrapingJob): string {
  const perMinute = ratePerMinute(job)

  if (!perMinute) {
    return '—'
  }

  return `${perMinute < 10 ? perMinute.toFixed(1) : Math.round(perMinute)} / min`
}

/**
 * What the card's second figure says: when it starts, how long is left, or how it
 * ended. A job that has settled has no estimate to give, so it says what happened.
 */
export function jobEta(job: ScrapingJob): string {
  if (job.status === 'scheduled') {
    return job.startAt ? `Starts ${timeLabel(job.startAt)}` : '—'
  }

  if (jobSettled(job)) {
    return job.completedAt ? `${jobStatusTag(job.status).label} ${timeLabel(job.completedAt)}` : jobStatusTag(job.status).label
  }

  if (job.status === 'paused') {
    return 'Paused'
  }

  const perMinute = ratePerMinute(job)
  const left = job.total - job.completed - job.failed

  if (!perMinute || left <= 0) {
    return job.status === 'queued' ? 'Waiting for a worker' : '—'
  }

  const minutes = left / perMinute

  return minutes < 1 ? '< 1 min' : `${Math.round(minutes)} min left`
}

/** What the panel's **Mode** cell says: the dialog's own two words for `refetch`. */
export const jobModeLabel = (job: ScrapingJob): string => job.refetch ? 'Force re-scrape' : 'Skip existing'

/** The panel's **Started**: when its messages actually went out, not when it was described. */
export const jobStartedLabel = (job: ScrapingJob): string => job.queuedAt ? timeLabel(job.queuedAt) : '—'

/** `of 640 chapters · 64%` — the line beside the panel's big figure. */
export function jobOfLabel(job: ScrapingJob): string {
  return `of ${countLabel(job.total)} ${contentNoun(job.libraryType)} · ${jobProgressPercent(job)}%`
}

/**
 * Chapters a minute, or null while there is nothing to divide.
 *
 * `completed` over the run so far, where the run runs from `queuedAt` — when the
 * messages actually went out, which is the panel's **Started** — to one of two ends:
 * `now()` while the job is still going, and `completedAt` once it has settled, so a
 * finished job keeps the rate it ran at instead of decaying as the day goes on.
 *
 * A flat average, deliberately: nothing is stored and nothing is sampled, so a job
 * that was paused for an hour reads as slow until it has run for a while again.
 */
function ratePerMinute(job: ScrapingJob): number | null {
  if (!job.queuedAt || job.completed === 0) {
    return null
  }

  const end = job.completedAt ? new Date(job.completedAt).getTime() : Date.now()
  const minutes = (end - new Date(job.queuedAt).getTime()) / MINUTE

  return minutes > 0 ? job.completed / minutes : null
}

/** The three tabs, in the mockup's order. */
export const SCRAPING_JOB_TABS: LibraryFilterOption<ScrapingJobTab>[] = [
  { label: 'Active', value: 'active' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'History', value: 'history' }
]

/** The mockup's *All libraries* select. The *All job types* one is left out: there is one type. */
export const SCRAPING_LIBRARY_FILTERS: LibraryFilterOption<ScrapingJobFilters['libraryType']>[] = [
  { label: 'All libraries', value: 'all' },
  { label: 'Novels', value: 'novel' },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' }
]
