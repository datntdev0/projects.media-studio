import { BadRequestException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { CreateLibraryContentDto } from './dto/library-content-create.dto';
import { LibraryContentPageDto } from './dto/library-content.dto';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { UpdateLibraryContentDto } from './dto/library-content-update.dto';
import { ImageAsset, LibraryContent, LibraryContentBase, LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType, NovelItem } from './entities/library-item.entity';
import { LibraryContentCounts, LibraryContentDraft, LibraryContentRepository } from './library-content.repository';
import { LibraryRepository } from './library.repository';

/** What every draft carries whatever its type: the root, minus what the repository stamps. */
type ContentRoot = Omit<LibraryContentBase, 'id' | 'createdAt' | 'updatedAt'>;

/** The fields a chapter adds, once the request has been checked for them. */
type ChapterBlock = Pick<NovelChapter, 'title' | 'language' | 'words'>;

/** The fields an asset adds, likewise. */
type AssetBlock = Pick<ImageAsset, 'filename' | 'filesize'>;

/** One piece of content a source is known to hold, as discovery reports it. */
export interface DiscoveredContent {
  index: number;
  title: string;
  sourceUrl: string;
}

/** What a completed scrape leaves on the row: where the bytes are, and how long they run. */
export interface ScrapedRow {
  contentUrl: string;
  words: number;
}

/**
 * What queueing needs of a row: which one, and what it is called in the live tree.
 *
 * `index` travels because this is the one moment the whole claimed set is in hand —
 * every later transition writes a status onto a node that already carries its number,
 * which is what keeps a chapter moving from costing a read to find out what it is.
 */
export interface QueuedContent {
  id: string;
  index: number;
}

/**
 * The rules for what a library item holds: which fields belong to which type of
 * row, where a chapter's number comes from, and what the item's counters say once
 * the row has landed.
 *
 * Framework-free — the two repositories and nothing else — so its spec needs no
 * Nest fixture.
 */
@Injectable()
export class LibraryContentManager {
  constructor(private readonly contents: LibraryContentRepository, private readonly items: LibraryRepository, private readonly realtime: RealtimeProvider) {}

  /**
   * One page of an item's content.
   *
   * Firestore orders it and narrows by `status`; the search and the slice happen
   * here, over what comes back — part 1's shape, and what keeps the subcollection
   * free of composite indexes.
   */
  async list(itemId: string, query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    const item = await this.requireItem(itemId);
    const matching = await this.contents.findMatching(itemId, { type: item.type, status: query.status });
    const found = matching.filter((content) => matchesSearch(content, query.search));
    const from = (query.page - 1) * query.pageSize;

    return {
      items: found.slice(from, from + query.pageSize),
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(itemId: string, contentId: string): Promise<LibraryContent> {
    await this.requireItem(itemId);

    return this.requireContent(itemId, contentId);
  }

  /**
   * The row, or null where there is none. For a caller that has no 404 to give: a
   * queued message names a row that may have been deleted since, and that is an
   * outcome rather than a failure.
   */
  find(itemId: string, contentId: string): Promise<LibraryContent | null> {
    return this.contents.findOne(itemId, contentId);
  }

  async create(itemId: string, input: CreateLibraryContentDto): Promise<LibraryContent> {
    const item = await this.requireItem(itemId);
    const created = await this.contents.create(itemId, await this.newDraft(item, input));

    await this.recount(item);

    return created;
  }

  /** The whole writable representation, so an omitted field is a cleared field. */
  async replace(itemId: string, contentId: string, input: UpdateLibraryContentDto): Promise<LibraryContent> {
    const item = await this.requireItem(itemId);
    const stored = await this.requireContent(itemId, contentId);
    const replaced = await this.contents.replace(itemId, stored, nextDraft(stored, input));

    await this.recount(item);

    return replaced;
  }

  async remove(itemId: string, contentId: string): Promise<void> {
    const item = await this.requireItem(itemId);

    await this.requireContent(itemId, contentId);
    await this.contents.remove(itemId, contentId);
    await this.recount(item);
  }

  /**
   * The pieces the source has and we do not, appended as placeholders.
   *
   * Matched on `sourceUrl` — the source's own key, and the only field that survives
   * a retitling or a chapter inserted above it. Answers with how many landed, so a
   * caller can say so.
   */
  async appendDiscovered(itemId: string, found: DiscoveredContent[]): Promise<number> {
    const item = await this.requireItem(itemId);

    // A chapter is the only row this can build. An asset would need a filename and
    // a size, and discovery reports neither — see `assetBlock`.
    if (item.type !== LibraryItemType.Novel) {
      throw new NotImplementedException(`Discovering the content of a ${item.type} set is not described yet`);
    }

    const stored = await this.contents.findMatching(itemId, { type: item.type });
    const known = new Set(stored.map((content) => content.sourceUrl).filter(Boolean));
    const fresh = found.filter((content) => !known.has(content.sourceUrl));

    // Nothing new writes nothing and recounts nothing: a second run costs one read.
    if (fresh.length === 0) {
      return 0;
    }

    await this.contents.createMany(itemId, fresh.map((content) => chapterDraft(item, content)));
    await this.recount(item);

    return fresh.length;
  }

  /**
   * Every chapter of a novel, in reading order — what a job selects from.
   *
   * Unpaged: a job is described against the whole novel, and the range it was given
   * is meaningless over a slice of it.
   */
  async chapters(itemId: string): Promise<NovelChapter[]> {
    const item = await this.requireItem(itemId);

    if (item.type !== LibraryItemType.Novel) {
      throw new NotImplementedException(`A ${item.type} set has no chapters to scrape`);
    }

    const stored = await this.contents.findMatching(itemId, { type: item.type });

    // The query ordered by `index`, which only a chapter has — so every row it
    // answered with is one.
    return stored.filter((content): content is NovelChapter => content.type === LibraryItemType.Novel);
  }

  /**
   * The rows a job has just claimed, queued.
   *
   * Written before anything is published, so a job booked for 03:00 does not leave
   * the screen looking untouched.
   */
  async markQueued(itemId: string, rows: QueuedContent[]): Promise<void> {
    const item = await this.requireItem(itemId);

    await this.contents.updateStatus(itemId, rows.map((row) => row.id), LibraryContentStatus.Pending);
    await this.realtime.publishQueued(itemId, rows.map((row) => ({ contentId: row.id, status: LibraryContentStatus.Pending, index: row.index })));
    await this.publishSummary(item, await this.recount(item));
  }

  /** One row, in flight. The counts do not move — `pending` already counted it. */
  async markScraping(itemId: string, contentId: string): Promise<void> {
    await this.contents.patch(itemId, contentId, { status: LibraryContentStatus.Scraping });
    await this.realtime.publishContent(itemId, contentId, LibraryContentStatus.Scraping);
  }

  /**
   * The bytes are stored, so the row points at them and the item is recounted.
   *
   * Answers with the counts `recount()` has just written, which is how a caller
   * knows whether this was the last one.
   */
  async completeScrape(itemId: string, contentId: string, stored: ScrapedRow): Promise<LibraryContentCounts> {
    const item = await this.requireItem(itemId);

    await this.contents.patch(itemId, contentId, { status: LibraryContentStatus.Completed, contentUrl: stored.contentUrl, words: stored.words });
    await this.realtime.publishContent(itemId, contentId, LibraryContentStatus.Completed);

    const counts = await this.recount(item);

    await this.publishSummary(item, counts);

    return counts;
  }

  /**
   * The attempts are spent.
   *
   * The stored text is left where it is: a forced re-scrape that failed keeps what it
   * already held, which is the safe direction — **Failed** does not mean empty.
   *
   * Answers with the counts, as `completeScrape` does, and recounts to get them. It did
   * neither before, which left the summary wrong and made a job whose *last* chapter
   * failed undetectable as drained — so the item sat at **Scraping** for good.
   */
  async markFailed(itemId: string, contentId: string): Promise<LibraryContentCounts> {
    const item = await this.requireItem(itemId);

    await this.contents.patch(itemId, contentId, { status: LibraryContentStatus.Failed });
    await this.realtime.publishContent(itemId, contentId, LibraryContentStatus.Failed);

    const counts = await this.recount(item);

    await this.publishSummary(item, counts);

    return counts;
  }

  /**
   * A brand new row. `index` is read from the store rather than sent, so "Add
   * chapter" is a title and nothing else.
   */
  private async newDraft(item: LibraryItem, input: CreateLibraryContentDto): Promise<LibraryContentDraft> {
    const root = rootOf(input);

    switch (item.type) {
      case LibraryItemType.Novel:
        return { ...root, type: item.type, index: input.index ?? (await this.contents.highestIndex(item.id)) + 1, ...chapterBlock(input) };
      // The two asset cases have one body and stay two, because each narrows the
      // draft to the shape its type carries; merged, neither would.
      case LibraryItemType.Image:
        return { ...root, type: item.type, ...assetBlock(input, item.type) };
      case LibraryItemType.Video:
        return { ...root, type: item.type, ...assetBlock(input, item.type) };
    }
  }

  /**
   * What the item holds, after its content changed.
   *
   * Read back as aggregations rather than tracked as deltas: a count that is
   * recomputed cannot drift, and a novel of twelve hundred chapters costs the same
   * as one of twelve.
   */
  /**
   * The item's live summary, after its rows moved.
   *
   * Called from the job writes and nowhere else. `create`, `replace` and `remove`
   * recount as readily but publish nothing: the screens read a summary only while it
   * says `scraping`, so a node written for a chapter somebody renamed by hand would be
   * noise with no reader.
   *
   * `item.status` is the item as it was read at the top of the call, which during a job
   * is `scraping` — the status it should keep until something settles it.
   */
  private publishSummary(item: LibraryItem, counts: LibraryContentCounts): Promise<void> {
    return this.realtime.publishItem(item.id, {
      status: item.status,
      total: counts.total,
      completed: counts.completed,
      failed: counts.failed,
      pending: counts.pending,
    });
  }

  private async recount(item: LibraryItem): Promise<LibraryContentCounts> {
    const counts = await this.contents.counts(item.id);

    await this.items.updateCounters(item.id, {
      discoveredCount: counts.total,
      downloadedCount: counts.completed,
      // A novel's metadata has no size field, so it is left out rather than added.
      downloadedSize: item.type === LibraryItemType.Novel ? undefined : counts.bytes,
    });

    return counts;
  }

  /** The item, or the 404 every route that names one owes. */
  private async requireItem(itemId: string): Promise<LibraryItem> {
    const item = await this.items.findById(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    return item;
  }

  /**
   * The row, or a 404. Content of another item is not reachable from here — the
   * subcollection path makes a cross-item read impossible rather than merely
   * refused.
   */
  private async requireContent(itemId: string, contentId: string): Promise<LibraryContent> {
    const content = await this.contents.findOne(itemId, contentId);

    if (!content) {
      throw new NotFoundException(`No content ${contentId} in library item ${itemId}`);
    }

    return content;
  }
}

/** The stored row, rewritten. Its type is the item's, and never the request's to move. */
function nextDraft(stored: LibraryContent, input: UpdateLibraryContentDto): LibraryContentDraft {
  // `sourceUrl` is the one root field a PUT does not rewrite. It is where the row came
  // from — the key `appendDiscovered` matches on, and the only address a re-scrape
  // has — so it belongs to discovery rather than to whoever is editing the text. Left
  // to `rootOf`, a save that omitted it cleared it, and the chapter could never be
  // fetched again: `ScrapingJobManager.start` drops a row with no source and counts it
  // as skipped.
  const root = { ...rootOf(input), sourceUrl: stored.sourceUrl };

  switch (stored.type) {
    // `index` is the one field an omission does not clear: a chapter has no "no
    // number" state, so leaving it out means leaving it where it is.
    case LibraryItemType.Novel:
      return { ...root, type: stored.type, index: input.index ?? stored.index, ...chapterBlock(input) };
    case LibraryItemType.Image:
      return { ...root, type: stored.type, ...assetBlock(input, stored.type) };
    case LibraryItemType.Video:
      return { ...root, type: stored.type, ...assetBlock(input, stored.type) };
  }
}

/**
 * What the row is, whatever its type: where it came from, where its bytes are, and
 * therefore where it stands. `status` is derived rather than sent — a row with a URL
 * holds something and a row without one does not, and no third answer is a client's
 * to give. The two states discovery and the runner set are theirs alone.
 */
function rootOf(input: CreateLibraryContentDto): ContentRoot {
  const contentUrl = input.contentUrl ?? null;

  return { sourceUrl: input.sourceUrl ?? null, contentUrl, status: contentUrl ? LibraryContentStatus.Completed : LibraryContentStatus.Pending };
}

/** A chapter is a title and the text under it — and is refused the fields of a file. */
function chapterBlock(input: CreateLibraryContentDto): ChapterBlock {
  const title = input.title?.trim();

  if (!title) {
    throw new BadRequestException('A chapter needs a title');
  }

  if (input.filename !== undefined || input.filesize !== undefined) {
    throw new BadRequestException('A chapter is not a file — leave `filename` and `filesize` out');
  }

  return { title, language: input.language ?? '', words: input.words ?? 0 };
}

/**
 * One chapter the source turned out to hold: its numbering and its title verbatim,
 * a placeholder for the text, and the language off the item — which the wizard set
 * from the crawler at creation, so discovery needs none of its own.
 */
function chapterDraft(item: NovelItem, content: DiscoveredContent): LibraryContentDraft {
  return {
    type: item.type,
    index: content.index,
    title: content.title,
    language: item.metadata.language,
    words: 0,
    sourceUrl: content.sourceUrl,
    contentUrl: null,
    status: LibraryContentStatus.Discovered,
  };
}

/** An asset is a file — and is refused the fields of a chapter. */
function assetBlock(input: CreateLibraryContentDto, type: LibraryItemType): AssetBlock {
  const filename = input.filename?.trim();

  if (!filename) {
    throw new BadRequestException(`A ${type} asset needs a filename`);
  }

  if (input.index !== undefined || input.title !== undefined || input.language !== undefined || input.words !== undefined) {
    throw new BadRequestException(`A ${type} asset is not a chapter — leave \`index\`, \`title\`, \`language\` and \`words\` out`);
  }

  return { filename, filesize: input.filesize ?? 0 };
}

/** Across a chapter's title, or an asset's filename — whichever the row is named by. */
function matchesSearch(content: LibraryContent, search?: string): boolean {
  const needle = search?.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const name = content.type === LibraryItemType.Novel ? content.title : content.filename;

  return name.toLowerCase().includes(needle);
}
