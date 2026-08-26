// Types and IPC contract for the scraping feature — crawler discovery and
// source previewing that back the "From a crawler" creation flow in the
// library dialog. Shared between the main process, the preload bridge, and
// the renderer for the same reason as `app-library.ts`.

import type { AppLibraryType } from './app-library';

/** The possible statuses of a scraping job — and, per task, of one chapter within it. */
export enum ScrapingJobStatus {
  Scheduled = 'scheduled',
  Queued = 'queued',
  Running = 'running',
  Paused = 'paused',
  Stopped = 'stopped',
  Completed = 'completed',
  Failed = 'failed',
}

/** The three a job settles in, and never leaves. What the History tab lists. */
export const TERMINAL_JOB_STATUSES = [ScrapingJobStatus.Stopped, ScrapingJobStatus.Completed, ScrapingJobStatus.Failed] as const;

/** Queued, running or paused — what the Active tab lists. */
export const ACTIVE_JOB_STATUSES = [ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused] as const;

/** The only statuses a caller may ask a job to move to — the rest are the runner's own, reached only by doing the work. */
export const REQUESTABLE_JOB_STATUSES = [ScrapingJobStatus.Queued, ScrapingJobStatus.Paused, ScrapingJobStatus.Stopped] as const;

/** One piece of content the job was asked to fetch, and where that ask has got to. */
export interface ScrapingTask {
  /** The library content row this task is for — and this task's own id within the job. */
  contentId: string;
  /** The chapter number — what the task list is ordered by. */
  index: number;
  sourceUrl: string;
  status: ScrapingJobStatus;
  startAt: number | null;
  completedAt: number | null;
  error: string | null;
}

/** A scraping job — one novel's worth of chapters, fetched from its crawler. */
export interface ScrapingJob {
  id: string;
  libraryId: string;
  /** The item's type, as it was. What the listing's library filter narrows on. */
  libraryType: AppLibraryType;
  /** As the item was called when the job was described. */
  libraryTitle: string;
  /** The item's `sourceName`, carried so re-publishing needs no read of it. */
  crawler: string;
  status: ScrapingJobStatus;
  /** The expression as it was sent — `all`, `missing`, or an index expression like `1,3,5,7` / `23-34`. */
  range: string;
  /** Whether a chapter that already holds text is fetched again. */
  refetch: boolean;
  /** How many times a failed chapter is tried again. */
  retry: number;
  /** When the job is due. Null was queued immediately. */
  startAt: number | null;
  /** When its tasks actually went out. */
  queuedAt: number | null;
  /** When it settled, whichever way. */
  completedAt: number | null;
  /** Tasks in the job. What the progress bar divides by. */
  total: number;
  completed: number;
  failed: number;
  /** Candidates dropped as already complete (only when `refetch` is false). */
  skipped: number;
  tasks: ScrapingTask[];
  createdAt: number;
  updatedAt: number;
}

/** What a caller hands over to create or fully replace a job — the id and the dates are the repository's to stamp. */
export type ScrapingJobDraft = Omit<ScrapingJob, 'id' | 'createdAt' | 'updatedAt'>;

/** The three tabs the Scrapings screen reads its job list by. */
export enum ScrapingJobState {
  Active = 'active',
  Scheduled = 'scheduled',
  History = 'history',
}

/** What a caller asks for when starting a job over a crawler-sourced novel. */
export interface CreateScrapingJobInput {
  libraryId: string;
  /** `all`, `missing`, or an index expression — `1,3,5,7` or `23-34`. */
  range: string;
  refetch?: boolean;
  /** When to start the job. Omitted or null queues it now. */
  startAt?: number | null;
  /** How many times a failed chapter is tried again. Defaults to 3. */
  retry?: number;
}

export interface ListScrapingJobsFilter {
  state?: ScrapingJobState;
  libraryType?: AppLibraryType;
  libraryId?: string;
}

/** One crawler this app knows how to run, and which library type it feeds. */
export interface CrawlerDescriptor {
  name: string;
  baseUrl: string;
  libraryType: AppLibraryType;
  defaultLanguage: string;
}

export interface ScrapingPreviewNovel {
  id: string;
  url: string;
  crawler: string;
  title: string;
  author: string | null;
  category: string | null;
  status: string | null;
  updatedAt: string | null;
  coverUrl: string | null;
  description: string | null;
}

/** What a source URL resolved to, as read by `preview` from the worker. */
export interface ScrapingPreview {
  crawler: string;
  sourceUrl: string;
  novel: ScrapingPreviewNovel;
  chapterCount: number;
  latestChapterTitle: string | null;
  latestChapterUrl: string | null;
}

/** What checking a library item's source for new chapter links found — no content is downloaded. */
export interface DiscoverResult {
  crawler: string;
  sourceUrl: string;
  totalChapters: number;
  newChapters: number;
  latestChapterTitle: string | null;
}

export const APP_SCRAPING_IPC_CHANNELS = {
  getCrawlers: 'app-scraping:get-crawlers',
  preview: 'app-scraping:preview',
  discover: 'app-scraping:discover',
  listJobs: 'app-scraping:list-jobs',
  createJob: 'app-scraping:create-job',
  removeJob: 'app-scraping:remove-job',
  updateJobStatus: 'app-scraping:update-job-status',
} as const;

export interface AppScrapingApi {
  getCrawlers(libraryType?: AppLibraryType): Promise<CrawlerDescriptor[]>;
  preview(crawler: string, sourceUrl: string): Promise<ScrapingPreview>;
  /** Checks a crawler-sourced novel's source for chapter links not yet on file, and records them as `Discovered` content rows. */
  discover(libraryId: string): Promise<DiscoverResult>;
  /** Newest first, each with the tasks it described. */
  listJobs(filter?: ListScrapingJobsFilter): Promise<ScrapingJob[]>;
  /** Persisted, and published or booked. A range that matches nothing is created `completed` with `total: 0`. */
  createJob(input: CreateScrapingJobInput): Promise<ScrapingJob>;
  /** Only a settled job (stopped/completed/failed) can be deleted — cancel it first. */
  removeJob(id: string): Promise<void>;
  /** The one field a caller may move a job to directly — `queued`, `paused` or `stopped`. A status the job cannot reach from where it stands is an error. */
  updateJobStatus(id: string, status: ScrapingJobStatus): Promise<ScrapingJob>;
}
