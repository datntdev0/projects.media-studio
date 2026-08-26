import { createLogger } from '../../helpers/logger';
import type { Db } from '../../database/client';
import type { Container } from '../../container';
import { QUEUE_NAMES } from '../queue-names';
import { getScrapingJob, updateScrapingJob } from '../../database/repositories/app-scraping-job.repo';
import { getAppLibraryContent, updateAppLibraryContent } from '../../database/repositories/app-library-content.repo';
import { getAppLibrary } from '../../database/repositories/app-library.repo';
import { recount } from '../../managers/app-library-content.manager';
import { deriveIdleLibraryStatus, setLibraryStatus } from '../../managers/app-library.manager';
import { fetchJson, workerBaseUrl } from '../../managers/app-scraping.manager';
import { AppLibraryStatus } from '../../../shared/app-library';
import { AppLibraryContentStatus, type AppLibraryContent } from '../../../shared/app-library-content';
import { ScrapingJobStatus, type ScrapingJob, type ScrapingJobDraft, type ScrapingTask } from '../../../shared/app-scraping';

const logger = createLogger('scraping-job');

// The first retry's wait. Each further one doubles it.
const BACKOFF_MS = 1_000;

const PENDING_TASK_STATUSES = [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running];
const HALTED_TASK_STATUSES = [ScrapingJobStatus.Paused, ScrapingJobStatus.Stopped];

interface ScrapingJobRequested {
  jobId: string;
}

interface WorkerChapterContent {
  title: string;
  content: string[];
}

/** Processes a job's chapters where nobody is waiting for it — the record is the authority, so a stopped/paused job is left alone rather than run anyway. */
export function registerScrapingJobHandler({ db, bus }: Container): void {
  bus.subscribe<ScrapingJobRequested>(QUEUE_NAMES.scrapingJobRequested, (message) => {
    void processJob(db, message.payload.jobId).catch((error: unknown) => {
      logger.error(`Job ${message.payload.jobId} failed to process`, error);
    });
  });
}

function draftOf(job: ScrapingJob): ScrapingJobDraft {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = job;
  return draft;
}

async function processJob(db: Db, jobId: string): Promise<void> {
  const queued = getScrapingJob(db, jobId);
  if (!queued || queued.status !== ScrapingJobStatus.Queued) {
    return;
  }

  const job = updateScrapingJob(db, jobId, { ...draftOf(queued), status: ScrapingJobStatus.Running });
  setLibraryStatus(db, job.libraryId, AppLibraryStatus.Scraping);
  logger.info(`Job ${jobId} started — ${job.total} chapter(s) of '${job.libraryTitle}' via ${job.crawler}`);

  for (const task of job.tasks) {
    if (task.status === ScrapingJobStatus.Completed) {
      continue;
    }

    const current = getScrapingJob(db, jobId);
    if (!current || current.status !== ScrapingJobStatus.Running) {
      logger.info(`Job ${jobId} is no longer running — stopping early`);
      return;
    }

    await runTask(db, current, task.contentId);
  }

  logger.info(`Job ${jobId} finished`);
}

/** One chapter, every attempt the job allows, in one run. */
async function runTask(db: Db, job: ScrapingJob, contentId: string): Promise<void> {
  const task = job.tasks.find((candidate) => candidate.contentId === contentId);
  if (!task) {
    return;
  }

  const content = getAppLibraryContent(db, job.libraryId, contentId);
  if (!content) {
    logger.warn(`Content ${contentId} of item ${job.libraryId} is gone — ${task.sourceUrl} will not be scraped`);
    finishTask(db, job, contentId, { status: ScrapingJobStatus.Failed, completedAt: Date.now(), error: 'The library row is gone' });
    return;
  }

  settleTask(db, job.id, contentId, { status: ScrapingJobStatus.Running, startAt: Date.now() });
  updateContentStatus(db, job.libraryId, content, AppLibraryContentStatus.InProgress);

  for (let attempt = 0; attempt <= job.retry; attempt += 1) {
    try {
      const query = `sourceUrl=${encodeURIComponent(task.sourceUrl)}`;
      const chapter = await fetchJson<WorkerChapterContent>(`${workerBaseUrl()}/novels/${job.crawler}/content?${query}`);
      const body = chapter.content.join('\n');

      updateContentCompleted(db, job.libraryId, content, chapter.title, body);
      finishTask(db, job, contentId, { status: ScrapingJobStatus.Completed, completedAt: Date.now(), error: null });
      logger.debug(`Task ${contentId} of job ${job.id} completed on attempt ${attempt + 1} of ${job.retry + 1}`);
      return;
    } catch (cause: unknown) {
      const error = cause instanceof Error ? cause.message : String(cause);
      logger.warn(`${task.sourceUrl} failed on attempt ${attempt + 1} of ${job.retry + 1} — ${error}`);

      if (attempt === job.retry) {
        updateContentStatus(db, job.libraryId, content, AppLibraryContentStatus.Failed);
        finishTask(db, job, contentId, { status: ScrapingJobStatus.Failed, completedAt: Date.now(), error });
        return;
      }

      await wait(BACKOFF_MS * 2 ** attempt);
    }
  }
}

/** Settles one task, recounts the item's counters, and — only once the job itself has just settled — moves the item off `Scraping` to what its counts now say. */
function finishTask(db: Db, job: ScrapingJob, contentId: string, patch: Partial<ScrapingTask>): void {
  const settled = settleTask(db, job.id, contentId, patch);
  recount(db, job.libraryId);

  if (!settled || (settled.status !== ScrapingJobStatus.Completed && settled.status !== ScrapingJobStatus.Failed)) {
    return;
  }

  if (settled.status === ScrapingJobStatus.Failed) {
    setLibraryStatus(db, job.libraryId, AppLibraryStatus.Failed);
    return;
  }

  const item = getAppLibrary(db, job.libraryId);
  if (item) {
    setLibraryStatus(db, job.libraryId, deriveIdleLibraryStatus(item));
  }
}

/** Writes one task's fields and re-settles the job's counters/status from the whole task list — read fresh, since a pause/stop may have landed while this task was in flight. */
function settleTask(db: Db, jobId: string, contentId: string, patch: Partial<ScrapingTask>): ScrapingJob | undefined {
  const job = getScrapingJob(db, jobId);
  if (!job) {
    return undefined;
  }

  const tasks = job.tasks.map((task) => (task.contentId === contentId ? { ...task, ...patch } : task));
  const completed = tasks.filter((task) => task.status === ScrapingJobStatus.Completed).length;
  const failed = tasks.filter((task) => task.status === ScrapingJobStatus.Failed).length;
  const pending = tasks.filter((task) => PENDING_TASK_STATUSES.includes(task.status)).length;
  const halted = tasks.filter((task) => HALTED_TASK_STATUSES.includes(task.status)).length;

  const draft: ScrapingJobDraft = { ...draftOf(job), tasks, completed, failed };

  if (pending === 0 && halted === 0) {
    draft.status = failed > 0 ? ScrapingJobStatus.Failed : ScrapingJobStatus.Completed;
    draft.completedAt = Date.now();
  }

  return updateScrapingJob(db, jobId, draft);
}

function updateContentStatus(db: Db, libraryId: string, content: AppLibraryContent, status: AppLibraryContentStatus): void {
  if (!content.textContent) {
    return;
  }
  updateAppLibraryContent(db, libraryId, content.id, {
    idx: content.idx,
    type: content.type,
    status,
    sourceUrl: content.sourceUrl,
    textContent: content.textContent,
    audioContent: null,
    imageContent: null,
    videoContent: null,
  });
}

function updateContentCompleted(db: Db, libraryId: string, content: AppLibraryContent, title: string, body: string): void {
  if (!content.textContent) {
    return;
  }
  updateAppLibraryContent(db, libraryId, content.id, {
    idx: content.idx,
    type: content.type,
    status: AppLibraryContentStatus.Completed,
    sourceUrl: content.sourceUrl,
    textContent: { ...content.textContent, title: title || content.textContent.title, body },
    audioContent: null,
    imageContent: null,
    videoContent: null,
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
