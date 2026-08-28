import { randomUUID } from 'node:crypto';
import type { Db } from '../database/client';
import type { MessageBus } from '../queue/message-bus';
import { QUEUE_NAMES } from '../queue/queue-names';
import { setSystemCacheItem } from '../database/repositories/system-cache.repo';
import { COVER_EXTENSION_BY_CONTENT_TYPE, writeCoverFile } from '../helpers/cover-storage';
import { config } from '../helpers/config';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import { createAppLibraryContent, listAppLibraryContents } from '../database/repositories/app-library-content.repo';
import { createScrapingJob, deleteScrapingJob, getScrapingJob, listScrapingJobs, updateScrapingJob } from '../database/repositories/app-scraping-job.repo';
import { recount } from './app-library-content.manager';
import { deriveIdleLibraryStatus, setLibraryStatus } from './app-library.manager';
import { AppLibraryType, LibrarySourceMode } from '../../shared/app-library';
import { AppLibraryContentStatus, AppLibraryContentType, ContentLanguage, type AppLibraryContent } from '../../shared/app-library-content';
import {
  ACTIVE_JOB_STATUSES,
  REQUESTABLE_JOB_STATUSES,
  ScrapingJobState,
  ScrapingJobStatus,
  TERMINAL_JOB_STATUSES,
  type CreateScrapingJobInput,
  type CrawlerDescriptor,
  type DiscoverResult,
  type ListScrapingJobsFilter,
  type ScrapingJob,
  type ScrapingJobDraft,
  type ScrapingPreview,
  type ScrapingTask,
} from '../../shared/app-scraping';

export interface AppScrapingManager {
  getCrawlers(libraryType?: AppLibraryType): CrawlerDescriptor[];
  preview(crawler: string, sourceUrl: string): Promise<ScrapingPreview>;
  discover(libraryId: string): Promise<DiscoverResult>;
  createJob(input: CreateScrapingJobInput): ScrapingJob;
  listJobs(filter?: ListScrapingJobsFilter): ScrapingJob[];
  removeJob(id: string): void;
  updateJobStatus(id: string, status: ScrapingJobStatus): ScrapingJob;
}

/** The crawlers the worker service knows how to run, and which library type each one feeds. */
const CRAWLERS: CrawlerDescriptor[] = [
  { name: 'novel543', baseUrl: 'https://www.novel543.com', libraryType: AppLibraryType.Novel, defaultLanguage: 'zh' },
];

const CACHE_TYPE = 'scraping-preview';
const PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_RETRY = 3;

/** What each job status may be reached from — the four with no way in are the runner's own, reached only by doing the work. */
const REACHABLE_FROM: Record<ScrapingJobStatus, ScrapingJobStatus[]> = {
  [ScrapingJobStatus.Scheduled]: [],
  [ScrapingJobStatus.Queued]: [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Paused],
  [ScrapingJobStatus.Running]: [],
  [ScrapingJobStatus.Paused]: [ScrapingJobStatus.Queued, ScrapingJobStatus.Running],
  [ScrapingJobStatus.Stopped]: [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused],
  [ScrapingJobStatus.Completed]: [],
  [ScrapingJobStatus.Failed]: [],
};

/** Scheduled or queued tasks move with a pause/stop; a running one is left out — its fetch is already in the air. */
const HALTABLE_TASK_STATUSES: ScrapingJobStatus[] = [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued];

/** Each tab, as the statuses it names. */
const STATE_STATUSES: Record<ScrapingJobState, readonly ScrapingJobStatus[]> = {
  [ScrapingJobState.Active]: ACTIVE_JOB_STATUSES,
  [ScrapingJobState.Scheduled]: [ScrapingJobStatus.Scheduled],
  [ScrapingJobState.History]: TERMINAL_JOB_STATUSES,
};

function stripJobStamps(job: ScrapingJob): ScrapingJobDraft {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = job;
  return draft;
}

function byNewest(a: ScrapingJob, b: ScrapingJob): number {
  return b.createdAt - a.createdAt;
}

function isIndex(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/** Parses `1,3,5,7` / `23-34` / `[23:34]` — comma-separated numbers or spans; anything else is rejected. */
function parseIndexes(expression: string): Set<number> {
  const tokens = expression.replace(/^[[(]|[)\]]$/g, '').split(',');
  const wanted = new Set<number>();

  for (const token of tokens) {
    const [from, to] = token.split(/[-:]/).map((part) => Number(part.trim()));
    if (!isIndex(from) || (to !== undefined && !isIndex(to))) {
      throw new Error(`'${expression}' is not a range. Try 'all', 'missing', '1,3,5' or '23-34'.`);
    }
    for (let index = from; index <= (to ?? from); index += 1) wanted.add(index);
  }

  return wanted;
}

/** The chapters a range names — `all`/`missing`, or an index expression over the chapters' numbering. */
function selectByRange(range: string, chapters: AppLibraryContent[]): AppLibraryContent[] {
  const expression = range.trim();
  if (expression === 'all') return chapters;
  if (expression === 'missing') return chapters.filter((chapter) => chapter.status !== AppLibraryContentStatus.Completed);
  const wanted = parseIndexes(expression);
  return chapters.filter((chapter) => wanted.has(chapter.idx));
}

function formatLocal(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** When the job runs, or null for now — a time already past is refused here, before the record is written. */
function startAtFrom(startAt: number | null | undefined): number | null {
  if (!startAt) return null;
  if (startAt <= Date.now()) {
    throw new Error(`'${formatLocal(startAt)}' is not a time in the future.`);
  }
  return startAt;
}

// The worker's response shapes (see src/worker/app/models.py) — camelCase over the wire.
interface WorkerNovel {
  id: string;
  url: string;
  crawler: string;
  title?: string | null;
  author?: string | null;
  category?: string | null;
  status?: string | null;
  updatedAt?: string | null;
  coverUrl?: string | null;
  description?: string | null;
}

interface WorkerChapter {
  index: number;
  title: string;
  url: string;
}

export function workerBaseUrl(): string {
  return config.scraper.baseUrl;
}

/** Matches a novel's stored language onto one of the three languages content rows carry; falls back to the crawler's default. */
function resolveLanguage(language: string | undefined, fallback: string): ContentLanguage {
  const key = (language || fallback).trim().toLowerCase();
  return (Object.values(ContentLanguage) as string[]).includes(key) ? (key as ContentLanguage) : ContentLanguage.English;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Worker request to ${url} failed with ${response.status}: ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Downloads the cover's bytes through the worker and saves them to disk under a generated name; null when the book has no cover. */
async function fetchCoverFile(base: string, crawler: string, sourceUrl: string): Promise<string | null> {
  const response = await fetch(`${base}/novels/${crawler}/cover?sourceUrl=${encodeURIComponent(sourceUrl)}`);
  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
  const extension = COVER_EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'jpg';
  const fileName = `${randomUUID()}.${extension}`;

  return writeCoverFile(fileName, Buffer.from(await response.arrayBuffer()));
}

async function fetchPreviewFromWorker(crawler: string, sourceUrl: string): Promise<ScrapingPreview> {
  const query = `sourceUrl=${encodeURIComponent(sourceUrl)}`;
  const base = workerBaseUrl();

  const [novel, chapters, coverPath] = await Promise.all([
    fetchJson<WorkerNovel>(`${base}/novels/${crawler}/metadata?${query}`),
    fetchJson<WorkerChapter[]>(`${base}/novels/${crawler}/chapters?${query}`),
    fetchCoverFile(base, crawler, sourceUrl).catch(() => null),
  ]);
  const latestChapter = chapters.at(-1);

  return {
    crawler,
    sourceUrl,
    novel: {
      id: novel.id,
      url: novel.url,
      crawler: novel.crawler,
      title: novel.title ?? '',
      author: novel.author ?? null,
      category: novel.category ?? null,
      status: novel.status ?? null,
      updatedAt: novel.updatedAt ?? null,
      coverUrl: coverPath,
      description: novel.description ?? null,
    },
    chapterCount: chapters.length,
    latestChapterTitle: latestChapter?.title ?? null,
    latestChapterUrl: latestChapter?.url ?? null,
  };
}

export function createAppScrapingManager(db: Db, bus: MessageBus): AppScrapingManager {
  return {
    getCrawlers: (libraryType) => CRAWLERS.filter((crawler) => libraryType === undefined || crawler.libraryType === libraryType),

    preview: async (crawler, sourceUrl) => {
      const descriptor = CRAWLERS.find((candidate) => candidate.name === crawler);
      if (!descriptor) {
        const known = CRAWLERS.map((candidate) => candidate.name).join(', ');
        throw new Error(`Unknown crawler '${crawler}'. Available: ${known}`);
      }

      const preview = await fetchPreviewFromWorker(crawler, sourceUrl);
      const cacheKey = `${crawler}:${sourceUrl}`;
      setSystemCacheItem(db, { cacheType: CACHE_TYPE, cacheKey, cacheDataJson: JSON.stringify(preview), ttl: PREVIEW_TTL_MS });
      return preview;
    },

    discover: async (libraryId) => {
      const item = getAppLibrary(db, libraryId);
      if (!item) {
        throw new Error(`Library item ${libraryId} not found`);
      }
      if (item.type !== AppLibraryType.Novel) {
        throw new Error('Only novel items can discover chapters.');
      }
      if (item.sourceMode !== LibrarySourceMode.Crawler || !item.sourceUrl) {
        throw new Error('This item has no crawler source to discover chapters from.');
      }

      const crawler = item.sourceName;
      const descriptor = CRAWLERS.find((candidate) => candidate.name === crawler);
      if (!descriptor) {
        const known = CRAWLERS.map((candidate) => candidate.name).join(', ');
        throw new Error(`Unknown crawler '${crawler}'. Available: ${known}`);
      }

      const query = `sourceUrl=${encodeURIComponent(item.sourceUrl)}`;
      const chapters = await fetchJson<WorkerChapter[]>(`${workerBaseUrl()}/novels/${crawler}/chapters?${query}`);

      const existing = listAppLibraryContents(db, libraryId, { type: AppLibraryContentType.Original });
      const knownUrls = new Set(existing.map((content) => content.sourceUrl).filter((url): url is string => url != null));
      const freshChapters = chapters.filter((chapter) => !knownUrls.has(chapter.url));

      const language = resolveLanguage(item.novelMetadata?.language, descriptor.defaultLanguage);
      let nextIdx = existing.length === 0 ? 1 : Math.max(...existing.map((content) => content.idx)) + 1;

      for (const chapter of freshChapters) {
        createAppLibraryContent(db, libraryId, {
          idx: nextIdx++,
          type: AppLibraryContentType.Original,
          status: AppLibraryContentStatus.Discovered,
          sourceUrl: chapter.url,
          textContent: { contentUrl: null, body: '', language, title: chapter.title },
          audioContent: null,
          imageContent: null,
          videoContent: null,
        });
      }

      if (freshChapters.length > 0) {
        recount(db, libraryId);
      }

      return {
        crawler,
        sourceUrl: item.sourceUrl,
        totalChapters: chapters.length,
        newChapters: freshChapters.length,
        latestChapterTitle: chapters.at(-1)?.title ?? null,
      };
    },

    createJob: (input) => {
      const item = getAppLibrary(db, input.libraryId);
      if (!item) {
        throw new Error(`Library item ${input.libraryId} not found`);
      }
      if (item.type !== AppLibraryType.Novel) {
        throw new Error(`${item.type} sets are not fetched from a source yet.`);
      }
      if (item.sourceMode !== LibrarySourceMode.Crawler || !item.sourceUrl) {
        throw new Error('A manual item has no source to scrape. Write its content by hand.');
      }

      const crawler = item.sourceName;
      const descriptor = CRAWLERS.find((candidate) => candidate.name === crawler);
      if (!descriptor) {
        const known = CRAWLERS.map((candidate) => candidate.name).join(', ');
        throw new Error(`Unknown crawler '${crawler}'. Available: ${known}`);
      }

      const startAt = startAtFrom(input.startAt);
      const chapters = listAppLibraryContents(db, item.id, { type: AppLibraryContentType.Original });
      const candidates = selectByRange(input.range, chapters);
      const fetchable = candidates.filter((chapter) => !!chapter.sourceUrl);
      const refetch = input.refetch ?? false;
      const wanted = refetch ? fetchable : fetchable.filter((chapter) => chapter.status !== AppLibraryContentStatus.Completed);
      const skipped = candidates.length - wanted.length;
      const retry = input.retry ?? DEFAULT_RETRY;
      const now = Date.now();

      const tasks: ScrapingTask[] = wanted.map((chapter) => ({
        contentId: chapter.id,
        index: chapter.idx,
        sourceUrl: chapter.sourceUrl!,
        status: ScrapingJobStatus.Scheduled,
        startAt: null,
        completedAt: null,
        error: null,
      }));

      const status = tasks.length === 0 ? ScrapingJobStatus.Completed : startAt ? ScrapingJobStatus.Scheduled : ScrapingJobStatus.Queued;

      const job = createScrapingJob(db, {
        libraryId: item.id,
        libraryType: item.type,
        libraryTitle: item.title,
        crawler,
        status,
        range: input.range,
        refetch,
        retry,
        startAt,
        queuedAt: null,
        completedAt: tasks.length === 0 ? now : null,
        total: tasks.length,
        completed: 0,
        failed: 0,
        skipped,
        tasks,
      });

      if (tasks.length > 0 && !startAt) {
        bus.publish(QUEUE_NAMES.scrapingJobRequested, { jobId: job.id });
      }

      return job;
    },

    listJobs: (filter) => {
      const statuses = filter?.state ? STATE_STATUSES[filter.state] : undefined;
      return listScrapingJobs(db, { statuses, libraryType: filter?.libraryType, libraryId: filter?.libraryId }).sort(byNewest);
    },

    removeJob: (id) => {
      const job = getScrapingJob(db, id);
      if (!job) {
        throw new Error(`No scraping job ${id}`);
      }
      if (!(TERMINAL_JOB_STATUSES as readonly ScrapingJobStatus[]).includes(job.status)) {
        throw new Error(`A job that is '${job.status}' cannot be deleted. Cancel it first, then delete it.`);
      }
      deleteScrapingJob(db, id);
    },

    updateJobStatus: (id, status) => {
      if (!(REQUESTABLE_JOB_STATUSES as readonly ScrapingJobStatus[]).includes(status)) {
        throw new Error(`A job cannot be asked for '${status}' — only ${REQUESTABLE_JOB_STATUSES.join(', ')}.`);
      }

      const job = getScrapingJob(db, id);
      if (!job) {
        throw new Error(`No scraping job ${id}`);
      }

      const from = REACHABLE_FROM[status];
      if (!from.includes(job.status)) {
        throw new Error(`A job that is '${job.status}' cannot be asked for '${status}'. That is reachable from: ${from.join(', ') || 'nothing'}.`);
      }

      if (status === ScrapingJobStatus.Queued) {
        const updated = updateScrapingJob(db, id, { ...stripJobStamps(job), status, queuedAt: Date.now() });
        bus.publish(QUEUE_NAMES.scrapingJobRequested, { jobId: id });
        return updated;
      }

      const tasks = job.tasks.map((task) => (HALTABLE_TASK_STATUSES.includes(task.status) ? { ...task, status } : task));
      const completedAt = status === ScrapingJobStatus.Stopped ? Date.now() : job.completedAt;
      const halted = updateScrapingJob(db, id, { ...stripJobStamps(job), status, tasks, completedAt });

      const item = getAppLibrary(db, job.libraryId);
      if (item) {
        setLibraryStatus(db, job.libraryId, deriveIdleLibraryStatus(item));
      }

      return halted;
    },
  };
}
