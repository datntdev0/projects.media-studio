import { BadRequestException, Injectable, Logger, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScrapingProvider } from '../core/providers/scraping.provider';
import { ScrapingContentRequested, QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { LibraryItemDto } from '../library/dto/library-item.dto';
import { LibraryContent, LibraryContentStatus, NovelChapter } from '../library/entities/library-content.entity';
import { LibraryItemType, LibrarySourceMode } from '../library/entities/library-item.entity';
import { LibraryContentManager } from '../library/library-content.manager';
import { LibraryManager } from '../library/library.manager';
import { validateSourceUrl, Crawler, requireCrawler } from './crawlers';
import { QueryListScrapingJobsDto, ScrapingJobState } from './dto/query-list-scraping-jobs.dto';
import { CreateScrapingJobDto, ScrapingJobDto, ScrapingJobPageDto } from './dto/scraping-job.dto';
import { ACTIVE_JOB_STATUSES, ScrapingJob, ScrapingJobStatus, TERMINAL_JOB_STATUSES } from './entities/scraping-job.entity';
import { ScrapingJobDraft, ScrapingJobPatch, ScrapingJobRepository, ScrapingTaskDraft } from './scraping-job.repository';

/** Every character range whose script is written without spaces, so words cannot be counted by them. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/**
 * What each status may be reached from — the whole transition rule, as a lookup
 * rather than a chain of `if`s, and what the `400`'s sentence is built from.
 *
 * The four with no way in are the runner's own: a job reaches them by doing the work.
 */
const REACHABLE_FROM: Record<ScrapingJobStatus, ScrapingJobStatus[]> = {
  [ScrapingJobStatus.Scheduled]: [],
  [ScrapingJobStatus.Queued]: [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Paused],
  [ScrapingJobStatus.Running]: [],
  [ScrapingJobStatus.Paused]: [ScrapingJobStatus.Queued, ScrapingJobStatus.Running],
  [ScrapingJobStatus.Stopped]: [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused],
  [ScrapingJobStatus.Completed]: [],
  [ScrapingJobStatus.Failed]: [],
};

/**
 * The task states a pause or a stop may move.
 *
 * A `running` task is left in all three: its fetch is already in the air, and marking
 * it would either be overwritten by the completion or throw away work already paid
 * for. So a pause takes effect within one chapter rather than instantly.
 */
const HALTABLE_TASK_STATUSES: ScrapingJobStatus[] = [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued];

/** The three a job settles in, widened to strings — what a status read back is compared against. */
const TERMINAL: readonly string[] = TERMINAL_JOB_STATUSES;

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
    private readonly libraryManager: LibraryManager,
    private readonly libraryContentManager: LibraryContentManager,
    private readonly scrapingJobRepository: ScrapingJobRepository,
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
  public async create(input: CreateScrapingJobDto): Promise<ScrapingJobDto> {
    const item = await this.libraryManager.get(input.libraryId);

    if (item.sourceMode !== LibrarySourceMode.Crawler || !item.sourceUrl) {
      throw new BadRequestException('A manual item has no source to scrape. Write its content by hand.');
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new NotImplementedException(`${item.type} sets are not fetched from a source yet`);
    }

    const crawler = requireCrawler(item.sourceName);
    validateSourceUrl(crawler, item.sourceUrl);

    const startAt = startAtFrom(input.startAt);
    const chapters = await this.libraryContentManager.chapters(item.id);
    const candidates = selectByRange(input.range, chapters);
    const fetchable = candidates.filter((chapter) => !!chapter.sourceUrl);
    const wanted = input.refetch ? fetchable : fetchable.filter((chapter) => chapter.status !== LibraryContentStatus.Completed);

    const job = await this.scrapingJobRepository.create(draftOf(item, crawler, input, startAt, candidates.length - wanted.length, wanted.length));
    const tasks = wanted.map((chapter) => taskDraft(job, chapter));
    await this.scrapingJobRepository.createTasks(job.id, tasks);

    // Skip publishing to job queue if the job is scheduled for later, or if it matched nothing to do.
    if (wanted.length === 0 || startAt) return this.detail(job);

    await this.producer.send(QueueTopic.ScrapingJobRequested, { jobId: job.id }, { attempts: 1 });
    return this.detail(job);
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
  public async list(query: QueryListScrapingJobsDto): Promise<ScrapingJobPageDto> {
    const statuses = query.state ? [...STATE_STATUSES[query.state]] : undefined;
    const matching = await this.scrapingJobRepository.findMatching({ statuses, libraryType: query.libraryType, libraryId: query.libraryId });
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
  public async runDueToScheduledJobs(): Promise<void> {
    const dueToJobs = await this.scrapingJobRepository.findScheduled(new Date());

    for (const job of dueToJobs) {
      const claimed = await this.scrapingJobRepository.claim(job.id);

      if (!claimed) continue;
      
      try {
        await this.publishScrapingTaskMessages(claimed);
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
  async scrape(message: ScrapingContentRequested, content: LibraryContent): Promise<void> {
    const scraped = await this.scraping.content(message.crawler, message.sourceUrl);
    const text = scraped.content.join('\n');
    const contentUrl = await this.files.saveText(message.itemId, text);
    await this.libraryContentManager.completeScrape(message.itemId, message.contentId, { contentUrl, words: wordCount(text) });
    await this.files.discard(content.contentUrl);
  }

  /**
   * An attempt failed and another is booked: the row says so now, and the task goes
   * back to `queued` for the attempt that is coming.
   *
   * The task status is not cosmetic — `scrape` gates on `queued`, and a task left
   * `running` by the attempt that just died is one the next attempt skips, quietly,
   * without throwing. The job then never fails and never drains. Back in the queue is
   * also where a pause can still reach it, which `running` is not.
   *
   * The row is marked here rather than only once the attempts are spent, because a
   * chapter whose fetch just failed is not being scraped, and saying **Scraping** until
   * the last attempt means saying it for as long as the backoff and the service's own
   * timeout take. The next attempt writes **Scraping** back at the top of `scrape`.
   */
  async retry(message: ScrapingContentRequested, error: string): Promise<void> {
    await this.scrapingJobRepository.patchTask(message.jobId, message.contentId, { status: ScrapingJobStatus.Queued, error });
    await this.realtime.publishTask(message.jobId, message.contentId, ScrapingJobStatus.Queued);

    // The row moves, and nothing else does: the job is still owed this chapter, so its
    // own status and counts are not this method's to touch.
    await this.libraryContentManager.markFailed(message.itemId, [message.contentId]);
  }

  /** The attempts are spent, and both records say so — and it may have been the last one owed. */
  async fail(message: ScrapingContentRequested, error: string): Promise<void> {
    await this.scrapingJobRepository.patchTask(message.jobId, message.contentId, { status: ScrapingJobStatus.Failed, completedAt: nowIso(), error });
    await this.realtime.publishTask(message.jobId, message.contentId, ScrapingJobStatus.Failed);
    await this.libraryContentManager.markFailed(message.itemId, [message.contentId]);
    await this.settleJob(message.jobId);
  }

  /**
   * The one field a client may move: where the job is.
   *
   * `queued` is `publish()` unchanged — republishing every unfinished task is exactly
   * what starting a booked job and resuming a paused one both mean, which is why they
   * are one branch rather than two endpoints.
   *
   * A pause does not drain the queue. It marks the record, and the consumer skips what
   * the record no longer wants — see the gate at the top of `scrape`.
   */
  async setStatus(id: string, status: ScrapingJobStatus): Promise<ScrapingJobDto> {
    const job = await this.require(id);
    const from = REACHABLE_FROM[status];

    if (!from.includes(job.status)) {
      throw new BadRequestException(`A job that is \`${job.status}\` cannot be asked for \`${status}\`. That is reachable from: ${from.join(', ') || 'nothing'}.`);
    }

    if (status === ScrapingJobStatus.Queued) {
      return this.detail(await this.publishScrapingTaskMessages(job));
    }

    return this.detail(await this.halt(job, status));
  }

  /**
   * Paused or stopped: the tasks that have not been picked up move with the job, and
   * the ones in flight are left to write their own completion a chapter later.
   */
  private async halt(job: ScrapingJob, status: ScrapingJobStatus): Promise<ScrapingJob> {
    const moving = (await this.scrapingJobRepository.tasks(job.id)).filter((task) => HALTABLE_TASK_STATUSES.includes(task.status));
    const contentIds = moving.map((task) => task.contentId);
    // Stopping settles the job; pausing is a state it is expected to leave again.
    const completedAt = status === ScrapingJobStatus.Stopped ? nowIso() : undefined;

    await this.scrapingJobRepository.setTaskStatus(job.id, contentIds, status);
    await this.scrapingJobRepository.patch(job.id, completedAt ? { status, completedAt } : { status });

    await this.realtime.publishTasks(job.id, moving.map((task) => ({ contentId: task.contentId, status, index: task.index })));
    await this.realtime.publishJob({ id: job.id, status });

    this.logger.log(`Job ${job.id} is ${status} — ${contentIds.length} task(s) moved with it`);

    return { ...job, status, completedAt: completedAt ?? job.completedAt };
  }

  /**
   * The settled jobs' nodes, dropped from the live tree.
   *
   * A tick after they settled rather than at the moment they did: the screen watches
   * for the transition and refetches, and removing the node in the same act would race
   * that refetch. A minute is far longer than a round trip, so the race is gone rather
   * than papered over.
   */
  async sweep(): Promise<void> {
    for (const [jobId, status] of Object.entries(await this.realtime.runningJobs())) {
      if (TERMINAL.includes(status)) {
        await this.realtime.clearJob(jobId);
      }
    }
  }

  /**
   * A record and its tasks, gone for good.
   *
   * Only a settled job. One that is still going has messages in the queue behind it,
   * and deleting the record under them would leave every one of them arriving to find
   * a task that is not there — work skipped that nobody cancelled. Stopping it first
   * is what `stopped` is for, and a stopped job deletes like any other.
   *
   * The live node goes with it rather than waiting for the sweep: the sweep works from
   * the node's own status, and the record that explains it is already gone.
   */
  async remove(id: string): Promise<void> {
    const job = await this.require(id);

    if (!TERMINAL.includes(job.status)) {
      throw new BadRequestException(`A job that is \`${job.status}\` cannot be deleted. Cancel it first, then delete it.`);
    }

    await this.scrapingJobRepository.remove(id);
    await this.realtime.clearJob(id);

    this.logger.log(`Job ${id} and its ${job.total} task(s) deleted`);
  }

  public async publishScrapingTaskMessages(job: ScrapingJob): Promise<ScrapingJob> {
    const tasks = (await this.scrapingJobRepository.tasks(job.id)).filter((task) => task.status !== ScrapingJobStatus.Completed);
    const queuedAt = nowIso();

    await this.libraryContentManager.markQueued(job.libraryId, tasks.map((task) => task.contentId));
    await this.scrapingJobRepository.setTaskStatus(job.id, tasks.map((task) => task.contentId), ScrapingJobStatus.Queued);
    await this.scrapingJobRepository.patch(job.id, { status: ScrapingJobStatus.Queued, queuedAt });

    await this.realtime.publishTasks(job.id, tasks.map((task) => ({ contentId: task.contentId, status: ScrapingJobStatus.Queued, index: task.index })));
    // `libraryId` is written here, where the node first appears: it is what the Library
    // screens match a running job to the item they draw.
    await this.realtime.publishJob({ id: job.id, libraryId: job.libraryId, status: ScrapingJobStatus.Queued, queuedAt: Date.parse(queuedAt) });

    const payloads = tasks.map((task) => ({
      jobId: job.id,
      itemId: job.libraryId,
      contentId: task.contentId,
      crawler: job.crawler,
      sourceUrl: task.sourceUrl,
      refetch: job.refetch,
      retry: job.retry,
    }));
    await this.producer.sendMany(QueueTopic.ScrapingContentRequested, payloads, { attempts: 1 });
    this.logger.log(`Queued ${payloads.length} chapter(s) of ${job.libraryId} for ${job.crawler}`);

    return { ...job, status: ScrapingJobStatus.Queued, queuedAt };
  }

  /**
   * The job's counters, and its status once nothing of it is left owed.
   *
   * Recomputed rather than incremented: two consumers finishing at once cannot lose
   * each other's write, and a counter that is derived cannot drift.
   */
  public async settleJob(jobId: string): Promise<void> {
    const counts = await this.scrapingJobRepository.counts(jobId);
    const fields: ScrapingJobPatch = { completed: counts.completed, failed: counts.failed };

    // Its own tasks, not the item's rows — a job over chapters 1–20 knows nothing
    // about the other 1,285.
    //
    // `halted` is the other half of the test, and it is what a pause rests on: the
    // tasks a pause moved are no longer *owed*, so `pending` alone reads a paused job
    // as drained the moment its last in-flight chapter lands — and stamps `completed`
    // over the `paused` somebody just asked for. A stopped job would lose its status
    // the same way.
    if (counts.pending === 0 && counts.halted === 0) {
      fields.status = counts.failed > 0 ? ScrapingJobStatus.Failed : ScrapingJobStatus.Completed;
      fields.completedAt = nowIso();
    }

    await this.scrapingJobRepository.patch(jobId, fields);
    await this.realtime.publishJob({ id: jobId, status: fields.status, completed: counts.completed, failed: counts.failed });
  }


  /** The record as it is answered with: its own fields, and the tasks it described. */
  private async detail(job: ScrapingJob): Promise<ScrapingJobDto> {
    return { ...job, tasks: await this.scrapingJobRepository.tasks(job.id) };
  }

  /** The job, or the 404 every route that names one owes. */
  private async require(id: string): Promise<ScrapingJob> {
    const job = await this.scrapingJobRepository.findById(id);

    if (!job) {
      throw new NotFoundException(`No scraping job ${id}`);
    }

    return job;
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
 * script is written without spaces — the only crawler reads `zh`.
 *
 * The frontend's helper in `app/utils/library-content.ts` agrees with this, and
 * neither agrees with anything linguistic.
 */
export function wordCount(text: string): number {
  const unspaced = text.match(UNSPACED_SCRIPT)?.length ?? 0;
  const rest = text.replace(UNSPACED_SCRIPT, ' ').trim();

  return unspaced + (rest ? rest.split(/\s+/).length : 0);
}
