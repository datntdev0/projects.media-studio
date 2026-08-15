import { BadRequestException, Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScrapingProvider } from '../core/providers/scraping.provider';
import { ContentScrapeRequested, QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { LibraryItemDto } from '../library/dto/library-item.dto';
import { LibraryContentStatus, NovelChapter } from '../library/entities/library-content.entity';
import { LibraryItemType, LibrarySourceMode } from '../library/entities/library-item.entity';
import { LibraryContentManager } from '../library/library-content.manager';
import { LibraryContentCounts } from '../library/library-content.repository';
import { LibraryManager } from '../library/library.manager';
import { checkHost, Crawler, requireCrawler } from './crawlers';
import { QueryListScrapingJobsDto, ScrapingJobState } from './dto/query-list-scraping-jobs.dto';
import { attemptsFor, CreateScrapingJobDto, ScrapingJobDto, ScrapingJobPageDto } from './dto/scraping-job.dto';
import { ACTIVE_JOB_STATUSES, ScrapingJob, ScrapingJobStatus, TERMINAL_JOB_STATUSES } from './entities/scraping-job.entity';
import { ScrapingJobDraft, ScrapingJobPatch, ScrapingJobRepository, ScrapingTaskDraft } from './scraping-job.repository';

/** Every character range whose script is written without spaces, so words cannot be counted by them. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/** Each tab, as the statuses it names. The one place the three groups are joined up. */
const STATE_STATUSES: Record<ScrapingJobState, readonly ScrapingJobStatus[]> = {
  [ScrapingJobState.Active]: ACTIVE_JOB_STATUSES,
  [ScrapingJobState.Scheduled]: [ScrapingJobStatus.Scheduled],
  [ScrapingJobState.History]: TERMINAL_JOB_STATUSES,
};

/**
 * Work that outlives the request.
 *
 * Two halves that never run together: `create` writes the record and hands its tasks
 * to the queue, and `scrape` is what a consumer does with one message of it. The
 * selection is made once, at request time, so the record is the truth about the ask
 * rather than an estimate of it.
 *
 * The record exists before anything is published, which is the whole point: a restart
 * between the two leaves a job that something can still see.
 */
@Injectable()
export class ScrapingJobManager {
  private readonly logger = new Logger(ScrapingJobManager.name);

  constructor(
    private readonly library: LibraryManager,
    private readonly contents: LibraryContentManager,
    private readonly jobs: ScrapingJobRepository,
    private readonly producer: QueueProducer,
    private readonly scraping: ScrapingProvider,
    private readonly files: ContentFileProvider,
    private readonly realtime: RealtimeProvider,
  ) {}

  /**
   * Describes a job, writes it down, and publishes it — or leaves it `scheduled` for
   * the cron, which is the whole of booking now that the record is durable.
   *
   * Everything that can be refused is refused before a document is written, so a job
   * that will not run leaves no record claiming it would.
   */
  async create(input: CreateScrapingJobDto): Promise<ScrapingJobDto> {
    const item = await this.library.get(input.libraryId);

    if (item.sourceMode !== LibrarySourceMode.Crawler || !item.sourceUrl) {
      throw new BadRequestException('A manual item has no source to scrape. Write its content by hand.');
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new NotImplementedException(`${item.type} sets are not fetched from a source yet`);
    }

    const crawler = requireCrawler(item.sourceName);

    checkHost(crawler, item.sourceUrl);

    const at = startAtFrom(input.startAt);
    const chapters = await this.contents.chapters(item.id);
    const candidates = selectByRange(input.range, chapters);
    // A chapter added by hand has no source to read, whatever the range said.
    const fetchable = candidates.filter((chapter) => !!chapter.sourceUrl);
    const wanted = input.refetch ? fetchable : fetchable.filter((chapter) => chapter.status !== LibraryContentStatus.Completed);

    const job = await this.jobs.create(draftOf(item, crawler, input, at, candidates.length - wanted.length, wanted.length));

    await this.jobs.createTasks(job.id, wanted.map((chapter) => taskDraft(job, chapter)));

    // Nothing to publish now, for one of two reasons: a range that matched nothing is
    // already a settled record, and a booked job waits for the cron. Both leave the
    // library exactly as they found it.
    if (wanted.length === 0 || at) {
      return this.detail(job);
    }

    return this.detail(await this.publish(job));
  }

  /**
   * One page of the records.
   *
   * Firestore narrows by the tab's status group and the library; the ordering and the
   * slice happen here, over what comes back — part 1's shape, and what keeps the
   * collection free of composite indexes.
   *
   * Tasks are answered with each job, which is the one place this listing costs more
   * than the library's: a page of twenty is twenty-one queries. The panel needs them.
   */
  async list(query: QueryListScrapingJobsDto): Promise<ScrapingJobPageDto> {
    const statuses = query.state ? [...STATE_STATUSES[query.state]] : undefined;
    const matching = await this.jobs.findMatching({ statuses, libraryType: query.libraryType, libraryId: query.libraryId });
    const found = matching.sort(byNewest);
    const from = (query.page - 1) * query.pageSize;

    return {
      items: await Promise.all(found.slice(from, from + query.pageSize).map((job) => this.detail(job))),
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * The bookings that have come due, published.
   *
   * The claim is what makes a second instance harmless: it reads the status and writes
   * it in one act, so exactly one instance sees `scheduled` and the other sees the job
   * it did not get.
   *
   * One job that will not publish does not take the rest of the tick with it.
   */
  async runDue(): Promise<void> {
    const due = await this.jobs.findScheduled(new Date());

    for (const job of due) {
      const claimed = await this.jobs.claim(job.id);

      if (!claimed) {
        continue;
      }

      try {
        await this.publish(claimed);
      } catch (cause: unknown) {
        this.logger.error(`Could not publish scheduled job ${job.id}`, cause);
      }
    }
  }

  /**
   * One chapter: read it, store it, and point both records at what was stored.
   *
   * The old object goes after the row moves, never before — a row pointing at
   * nothing is worse than an object nobody reads, which is the order the browser's
   * own upload takes.
   */
  async scrape(message: ContentScrapeRequested): Promise<void> {
    const task = await this.jobs.task(message.jobId, message.contentId);

    // A job deleted between the send and the delivery is not a failure.
    if (!task) {
      this.logger.warn(`Task ${message.contentId} of job ${message.jobId} is gone — nothing to scrape`);

      return;
    }

    await this.jobs.startTask(message.jobId, message.contentId, nowIso());

    const content = await this.contents.find(message.itemId, message.contentId);

    // Failed rather than returned quietly: a job whose item was deleted mid-run used
    // to leave a task that never moved, and therefore a job that never drained.
    if (!content || content.type !== LibraryItemType.Novel) {
      await this.jobs.patchTask(message.jobId, message.contentId, { status: ScrapingJobStatus.Failed, completedAt: nowIso(), error: 'The library row is gone' });
      await this.settleJob(message.jobId);

      return;
    }

    const scraped = await this.scraping.content(message.crawler, message.sourceUrl);
    // One newline between lines, which is what the reader splits on and what the
    // browser's own editor writes.
    const text = scraped.content.join('\n');
    const contentUrl = await this.files.saveText(message.itemId, text);
    const counts = await this.contents.completeScrape(message.itemId, message.contentId, { contentUrl, words: wordCount(text) });

    await this.files.discard(content.contentUrl);
    await this.jobs.patchTask(message.jobId, message.contentId, { status: ScrapingJobStatus.Completed, completedAt: nowIso(), error: null });

    // Debug rather than log: one line per chapter is a thousand lines per novel, and
    // the screen is where progress is meant to be read. It is here at all because
    // otherwise a draining queue says nothing at all.
    this.logger.debug(`Stored ${content.index} of ${message.itemId} — ${counts.completed}/${counts.total} done`);

    await this.settleJob(message.jobId);
    await this.settleItem(message.itemId, counts);
  }

  /** The attempts are spent, and both records say so — and it may have been the last one owed. */
  async fail(message: ContentScrapeRequested, error: string): Promise<void> {
    await this.jobs.patchTask(message.jobId, message.contentId, { status: ScrapingJobStatus.Failed, completedAt: nowIso(), error });

    const counts = await this.contents.markFailed(message.itemId, message.contentId);

    await this.settleJob(message.jobId);
    await this.settleItem(message.itemId, counts);
  }

  /**
   * One message per task, published in bulk. Shared by the immediate path and by a
   * booking coming due — it is one method because they are one act.
   *
   * Each payload is built field by field rather than spread from its task, so a field
   * the store grows cannot travel through the queue without anyone deciding it should.
   */
  private async publish(job: ScrapingJob): Promise<ScrapingJob> {
    const tasks = (await this.jobs.tasks(job.id)).filter((task) => task.status !== ScrapingJobStatus.Completed);
    const queuedAt = nowIso();

    // The rows rather than their ids: the live tree wants each one's number, and this
    // is the one moment the claimed set is in hand.
    await this.contents.markQueued(job.libraryId, tasks.map((task) => ({ id: task.contentId, index: task.index })));
    await this.library.markScraping(job.libraryId);
    await this.jobs.setTaskStatus(job.id, tasks.map((task) => task.contentId), ScrapingJobStatus.Queued);

    const payloads = tasks.map((task) => ({
      jobId: job.id,
      itemId: job.libraryId,
      contentId: task.contentId,
      crawler: job.crawler,
      sourceUrl: task.sourceUrl,
      refetch: job.refetch,
    }));

    await this.producer.sendMany(QueueTopic.ContentScrapeRequested, payloads, { attempts: attemptsFor(job.retry) });
    await this.jobs.patch(job.id, { status: ScrapingJobStatus.Queued, queuedAt });

    this.logger.log(`Queued ${payloads.length} chapter(s) of ${job.libraryId} for ${job.crawler}`);

    return { ...job, status: ScrapingJobStatus.Queued, queuedAt };
  }

  /**
   * The job's counters, and its status once nothing of it is left owed.
   *
   * Recomputed rather than incremented: two consumers finishing at once cannot lose
   * each other's write, and a counter that is derived cannot drift.
   */
  private async settleJob(jobId: string): Promise<void> {
    const counts = await this.jobs.counts(jobId);
    const fields: ScrapingJobPatch = { completed: counts.completed, failed: counts.failed };

    // Its own tasks, not the item's rows — a job over chapters 1–20 knows nothing
    // about the other 1,285.
    if (counts.pending === 0) {
      fields.status = counts.failed > 0 ? ScrapingJobStatus.Failed : ScrapingJobStatus.Completed;
      fields.completedAt = nowIso();
    }

    await this.jobs.patch(jobId, fields);
  }

  /**
   * Where a job leaves the item, once nothing of it is queued or in flight.
   *
   * `pending === 0` asks whether *anything at all* is still owed on the item — a
   * second, overlapping job included — which is a different question from whether
   * this job is done, and both are right.
   *
   * The per-row subtree goes with it: it described work that is over. The summary
   * stays, because it is what tells the screen the job has settled.
   */
  private async settleItem(itemId: string, counts: LibraryContentCounts): Promise<void> {
    if (counts.pending > 0) {
      return;
    }

    if (counts.failed > 0) {
      await this.library.markFailed(itemId);
    } else {
      await this.library.markReady(itemId);
    }

    await this.realtime.clearContents(itemId);
  }

  /** The record as it is answered with: its own fields, and the tasks it described. */
  private async detail(job: ScrapingJob): Promise<ScrapingJobDto> {
    return { ...job, tasks: await this.jobs.tasks(job.id) };
  }
}

/** The record as it is first written. A job that matched nothing is settled on the spot. */
function draftOf(item: LibraryItemDto, crawler: Crawler, input: CreateScrapingJobDto, at: Date | null, skipped: number, total: number): ScrapingJobDraft {
  return {
    libraryId: item.id,
    libraryType: item.type,
    libraryTitle: item.title,
    crawler: crawler.name,
    status: statusFor(at, total),
    range: input.range,
    refetch: input.refetch,
    retry: input.retry,
    startAt: at?.toISOString() ?? null,
    queuedAt: null,
    completedAt: total === 0 ? nowIso() : null,
    total,
    completed: 0,
    failed: 0,
    skipped,
  };
}

function statusFor(at: Date | null, total: number): ScrapingJobStatus {
  if (total === 0) {
    return ScrapingJobStatus.Completed;
  }

  return at ? ScrapingJobStatus.Scheduled : ScrapingJobStatus.Queued;
}

/**
 * One task. Written `scheduled` whatever the job is, because `queued` is what a
 * consumer acts on and nothing has been published yet.
 */
function taskDraft(job: ScrapingJob, chapter: NovelChapter): ScrapingTaskDraft {
  return {
    contentId: chapter.id,
    libraryId: job.libraryId,
    index: chapter.index,
    sourceUrl: chapter.sourceUrl!,
    status: ScrapingJobStatus.Scheduled,
    refetch: job.refetch,
    retry: job.retry,
    startAt: null,
    completedAt: null,
    error: null,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Newest first, which is the order a listing of work reads in. ISO strings compare as instants. */
function byNewest(one: ScrapingJob, two: ScrapingJob): number {
  return two.createdAt.localeCompare(one.createdAt);
}

/**
 * When the work runs, or null for now. A time that has already passed is the
 * caller's mistake and is refused here, before the record is written.
 */
function startAtFrom(startAt: string | null): Date | null {
  if (!startAt) {
    return null;
  }

  const at = new Date(startAt);

  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) {
    throw new BadRequestException(`\`${startAt}\` is not a time in the future.`);
  }

  return at;
}

/**
 * The rows a range names.
 *
 * `all` and `missing` are the two the dialog recommends; anything else is an index
 * expression over the chapters' own numbering — `1,3,5,7`, `23-34`, `[23:34]`. What
 * `refetch` then does to the result is the caller's other question, and is not this
 * function's business.
 */
export function selectByRange(range: string, chapters: NovelChapter[]): NovelChapter[] {
  const expression = range.trim();

  if (expression === 'all') {
    return chapters;
  }

  if (expression === 'missing') {
    return chapters.filter((chapter) => chapter.status !== LibraryContentStatus.Completed);
  }

  const wanted = parseIndexes(expression);

  return chapters.filter((chapter) => wanted.has(chapter.index));
}

/**
 * `1,3,5,7`, `23-34`, `[23:34]` — comma-separated tokens, each a number or a span,
 * with surrounding brackets tolerated because a person who typed them meant the same
 * thing. Anything else is a 400 before a message is published.
 */
function parseIndexes(expression: string): Set<number> {
  const tokens = expression.replace(/^[[(]|[)\]]$/g, '').split(',');
  const wanted = new Set<number>();

  for (const token of tokens) {
    const [from, to] = token.split(/[-:]/).map((part) => Number(part.trim()));

    if (!isIndex(from) || (to !== undefined && !isIndex(to))) {
      throw new BadRequestException(`\`${expression}\` is not a range. Try \`all\`, \`missing\`, \`1,3,5\` or \`23-34\`.`);
    }

    for (let index = from; index <= (to ?? from); index += 1) {
      wanted.add(index);
    }
  }

  return wanted;
}

function isIndex(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

/**
 * How long a body runs. Whitespace-separated, and counted by character where the
 * script is written without spaces — the only crawler reads `zh-Hant`.
 *
 * The frontend's helper in `app/utils/library-content.ts` agrees with this, and
 * neither agrees with anything linguistic.
 */
export function wordCount(text: string): number {
  const unspaced = text.match(UNSPACED_SCRIPT)?.length ?? 0;
  const rest = text.replace(UNSPACED_SCRIPT, ' ').trim();

  return unspaced + (rest ? rest.split(/\s+/).length : 0);
}
