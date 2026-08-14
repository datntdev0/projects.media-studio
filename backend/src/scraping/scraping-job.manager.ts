import { BadRequestException, Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { ScheduleProvider } from '../core/providers/schedule.provider';
import { ScrapingProvider } from '../core/providers/scraping.provider';
import { ContentScrapeRequested, QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { LibraryContentStatus, NovelChapter } from '../library/entities/library-content.entity';
import { LibraryItemType, LibrarySourceMode } from '../library/entities/library-item.entity';
import { LibraryContentManager } from '../library/library-content.manager';
import { LibraryContentCounts } from '../library/library-content.repository';
import { LibraryManager } from '../library/library.manager';
import { checkHost, Crawler, requireCrawler } from './crawlers';
import { attemptsFor, ScrapingJobDto, ScrapingJobStartedDto } from './dto/scraping-job.dto';

/** Every character range whose script is written without spaces, so words cannot be counted by them. */
const UNSPACED_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿]/g;

/**
 * Work that outlives the request.
 *
 * Two halves that never run together: `start` describes a job and hands it to the
 * queue, and `scrape` is what a consumer does with one message of it. The selection
 * is made once, at request time, so the count the caller is told is the truth rather
 * than an estimate.
 *
 * A manager of its own rather than two more methods on `ScrapingManager`: that one
 * reads a source and caches the answer, and this one moves rows.
 */
@Injectable()
export class ScrapingJobManager {
  private readonly logger = new Logger(ScrapingJobManager.name);

  constructor(
    private readonly library: LibraryManager,
    private readonly contents: LibraryContentManager,
    private readonly producer: QueueProducer,
    private readonly schedule: ScheduleProvider,
    private readonly scraping: ScrapingProvider,
    private readonly files: ContentFileProvider,
    private readonly realtime: RealtimeProvider,
  ) {}

  /**
   * Selects, marks, and publishes — or books the publishing for a wall-clock time.
   *
   * Everything that can be refused is refused before a row is written, so a job that
   * will not run leaves nothing marked as though it would.
   */
  async start(input: ScrapingJobDto): Promise<ScrapingJobStartedDto> {
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
    const queued = input.refetch ? fetchable : fetchable.filter((chapter) => chapter.status !== LibraryContentStatus.Completed);
    const skipped = candidates.length - queued.length;

    // An answer rather than a failure: a range can legitimately match nothing.
    if (queued.length === 0) {
      return { queued: 0, skipped, startAt: null };
    }

    // Marked before anything is published, so a job booked for 03:00 does not leave
    // the screen looking untouched.
    // The whole rows rather than their ids: the live tree wants each one's number, and
    // this is the one moment the claimed set is in hand.
    await this.contents.markQueued(item.id, queued.map((chapter) => ({ id: chapter.id, index: chapter.index })));
    await this.library.markScraping(item.id);

    const publish = () => this.publish(crawler, item.id, queued, input);

    if (at) {
      // Booked under the item's own name, so a second booking for it replaces the
      // first rather than publishing the work twice.
      this.schedule.runAt(`scrape:${item.id}`, at, publish);
    } else {
      await publish();
    }

    return { queued: queued.length, skipped, startAt: at?.toISOString() ?? null };
  }

  /**
   * One chapter: read it, store it, and point the row at what was stored.
   *
   * The old object goes after the row moves, never before — a row pointing at
   * nothing is worse than an object nobody reads, which is the order the browser's
   * own upload takes.
   */
  async scrape(message: ContentScrapeRequested): Promise<void> {
    const content = await this.contents.find(message.itemId, message.contentId);

    // A row deleted between the send and the delivery is not a failure.
    if (!content || content.type !== LibraryItemType.Novel) {
      this.logger.warn(`Content ${message.contentId} of ${message.itemId} is gone — nothing to scrape`);

      return;
    }

    // A re-delivered message for work already done costs one read rather than a fetch.
    if (content.status === LibraryContentStatus.Completed && !message.refetch) {
      return;
    }

    await this.contents.markScraping(message.itemId, message.contentId);

    const scraped = await this.scraping.content(message.crawler, message.sourceUrl);
    // One newline between lines, which is what the reader splits on and what the
    // browser's own editor writes.
    const text = scraped.content.join('\n');
    const contentUrl = await this.files.saveText(message.itemId, text);
    const counts = await this.contents.completeScrape(message.itemId, message.contentId, { contentUrl, words: wordCount(text) });

    await this.files.discard(content.contentUrl);

    // Debug rather than log: one line per chapter is a thousand lines per novel, and
    // the screen is where progress is meant to be read. It is here at all because
    // otherwise a draining queue says nothing at all.
    this.logger.debug(`Stored ${content.index} of ${message.itemId} — ${counts.completed}/${counts.total} done`);

    await this.settle(message.itemId, counts);
  }

  /** The attempts are spent, and the row says so — and may have been the last one owed. */
  async fail(message: ContentScrapeRequested): Promise<void> {
    const counts = await this.contents.markFailed(message.itemId, message.contentId);

    await this.settle(message.itemId, counts);
  }

  /**
   * Where a job leaves the item, once nothing of it is queued or in flight.
   *
   * `pending === 0` is the whole test. It was `completed === total`, which asks whether
   * the *novel* is downloaded rather than whether the *job* is over — so scraping
   * chapters 1–20 of 1,305 left the item at **Scraping** for good, and so did any job
   * that ended with a row failed.
   *
   * The per-row subtree goes with it: it described work that is over. The summary stays,
   * because it is what tells the screen the job has settled.
   */
  private async settle(itemId: string, counts: LibraryContentCounts): Promise<void> {
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

  /**
   * One message per chapter, published in bulk.
   *
   * Each payload is built field by field rather than spread from its row, so a field
   * the store grows cannot travel through the queue without anyone deciding it should.
   */
  private async publish(crawler: Crawler, itemId: string, chapters: NovelChapter[], input: ScrapingJobDto): Promise<void> {
    const payloads = chapters.map((chapter) => ({
      itemId,
      contentId: chapter.id,
      crawler: crawler.name,
      sourceUrl: chapter.sourceUrl!,
      refetch: input.refetch,
    }));

    await this.producer.sendMany(QueueTopic.ContentScrapeRequested, payloads, { attempts: attemptsFor(input.retry) });

    this.logger.log(`Queued ${payloads.length} chapter(s) of ${itemId} for ${crawler.name}`);
  }
}

/**
 * When the work runs, or null for now. A time that has already passed is the
 * caller's mistake and is refused here — `ScheduleProvider` would throw on it after
 * the rows had been marked.
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
