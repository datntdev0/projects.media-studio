import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateLibraryItemDto, LibraryItemMetadataDto } from './dto/create-library-item.dto';
import { LibraryItemDto } from './dto/library-item.dto';
import { LibraryItemPageDto, LibraryListItemDto } from './dto/library-list-item.dto';
import { QueryListLibraryItemsDto } from './dto/query-list-library-items.dto';
import { UpdateLibraryItemDto, WRITABLE_STATUSES } from './dto/update-library-item.dto';
import { LibraryItemMetadataBase, NovelMetadata } from './entities/library-item-metadata.entity';
import { LibraryItem, LibraryItemBase, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from './entities/library-item.entity';
import { LibraryContentRepository } from './library-content.repository';
import { LibraryItemDraft, LibraryRepository } from './library.repository';

/** What a manual item's source is called — it is its own. */
const MANUAL_SOURCE = 'Manual';

/** A new item holds nothing, and part 1 has nothing that would fetch anything. */
const NOTHING_FETCHED: LibraryItemMetadataBase = { discoveredCount: 0, discoveredAt: null, downloadedCount: 0 };

/** What every draft carries whatever its type: the root, minus what the repository stamps. */
type LibraryItemRoot = Omit<LibraryItemBase, 'id' | 'createdAt' | 'updatedAt'>;

/** The novel fields a client owns — the rest of `metadata` is the job runner's. */
type WritableNovelMetadata = Omit<NovelMetadata, keyof LibraryItemMetadataBase>;

/**
 * The library's rules: what a client may decide, what the server decides for it,
 * and what a request is refused for.
 *
 * Framework-free — no request, no response, nothing but the repository — so its
 * spec needs no Nest fixture.
 */
@Injectable()
export class LibraryManager {
  constructor(private readonly repository: LibraryRepository, private readonly contents: LibraryContentRepository) {}

  /**
   * One page of the listing.
   *
   * Firestore narrows by the three enums it is indexed on; the search, the
   * ordering and the slice happen here, over what comes back. That is what keeps
   * the collection free of composite indexes — and what makes the repository's
   * scan limit the honest ceiling on the catalogue's size.
   */
  async list(query: QueryListLibraryItemsDto): Promise<LibraryItemPageDto> {
    const matching = await this.repository.findMatching({ type: query.type, status: query.status, sourceMode: query.sourceMode });
    const found = matching.filter((item) => matchesSearch(item, query.search)).sort(byRecentChange);
    const from = (query.page - 1) * query.pageSize;

    return {
      items: found.slice(from, from + query.pageSize).map(listRow),
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** The read half of CRUD — what refreshes a row after an edit. */
  get(id: string): Promise<LibraryItemDto> {
    return this.require(id);
  }

  async create(input: CreateLibraryItemDto): Promise<LibraryItemDto> {
    checkWritableMetadata(input.type, input.metadata);

    const root: LibraryItemRoot = {
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      status: LibraryItemStatus.Draft,
      ...source(input),
    };

    return this.repository.create(newDraft(input.type, root, input.metadata));
  }

  /** The whole writable representation, so an omitted field is a cleared field. */
  async replace(id: string, input: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    const stored = await this.require(id);

    checkImmutable(stored, input);
    checkStatus(input.status);
    checkWritableMetadata(stored.type, input.metadata);

    const root: LibraryItemRoot = {
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      status: input.status ?? LibraryItemStatus.Draft,
      ...source(input),
    };

    return this.repository.replace(stored, nextDraft(stored, root, input.metadata));
  }

  /** The item, and everything filed under it — Firestore does not cascade. */
  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.contents.removeAll(id);
    await this.repository.delete(id);
  }

  /** The item, or the 404 every route that names one owes. */
  private async require(id: string): Promise<LibraryItem> {
    const item = await this.repository.findById(id);

    if (!item) {
      throw new NotFoundException(`No library item ${id}`);
    }

    return item;
  }
}

/** A brand new item's metadata: the writable block, over nothing fetched. */
function newDraft(type: LibraryItemType, root: LibraryItemRoot, writable?: LibraryItemMetadataDto): LibraryItemDraft {
  switch (type) {
    case LibraryItemType.Novel:
      return { ...root, type, metadata: { ...NOTHING_FETCHED, ...novelBlock(writable) } };
    case LibraryItemType.Image:
      return { ...root, type, metadata: { ...NOTHING_FETCHED, downloadedSize: 0 } };
    case LibraryItemType.Video:
      return { ...root, type, metadata: { ...NOTHING_FETCHED, downloadedSize: 0, downloadedDuration: 0 } };
  }
}

/**
 * The stored item, rewritten. Its counters are carried over rather than read from
 * the request: they say what was actually fetched, and an update able to zero them
 * would let a client erase that.
 */
function nextDraft(stored: LibraryItem, root: LibraryItemRoot, writable?: LibraryItemMetadataDto): LibraryItemDraft {
  switch (stored.type) {
    case LibraryItemType.Novel:
      return { ...root, type: stored.type, metadata: { ...stored.metadata, ...novelBlock(writable) } };
    // The two set cases have one body and stay two, because each narrows
    // `stored.metadata` to the shape its type carries; merged, neither would.
    case LibraryItemType.Image:
      return { ...root, type: stored.type, metadata: stored.metadata };
    case LibraryItemType.Video:
      return { ...root, type: stored.type, metadata: stored.metadata };
  }
}

/** Each field cleared where the request left it out — that is what `PUT` promises. */
function novelBlock(writable?: LibraryItemMetadataDto): WritableNovelMetadata {
  return {
    status: writable?.status ?? NovelStatus.Ongoing,
    author: writable?.author ?? '',
    language: writable?.language ?? '',
    genres: writable?.genres ?? [],
    description: writable?.description ?? '',
  };
}

/**
 * Where the content comes from, as the item stores it.
 *
 * A crawler item is a URL and the crawler that reads it, and is refused without
 * either. A manual item is its own source: it is called `Manual` whatever was
 * sent, and a URL is refused rather than stored where nothing will read it.
 */
function source(input: CreateLibraryItemDto): Pick<LibraryItemRoot, 'sourceMode' | 'sourceName' | 'sourceUrl'> {
  const name = input.sourceName?.trim();

  if (input.sourceMode === LibrarySourceMode.Crawler) {
    if (!input.sourceUrl) {
      throw new BadRequestException('A crawler item needs the URL to crawl');
    }

    if (!name) {
      throw new BadRequestException('A crawler item needs the name of the crawler that reads it');
    }

    return { sourceMode: input.sourceMode, sourceName: name, sourceUrl: input.sourceUrl };
  }

  if (input.sourceUrl) {
    throw new BadRequestException('A manual item has nothing to read — leave sourceUrl out');
  }

  return { sourceMode: input.sourceMode, sourceName: MANUAL_SOURCE, sourceUrl: null };
}

/**
 * Only a novel has a writable `metadata`. A set's whole metadata is counters, and
 * those are the job runner's — so a body carrying any is a mistake worth saying
 * out loud rather than ignoring.
 */
function checkWritableMetadata(type: LibraryItemType, writable?: LibraryItemMetadataDto): void {
  if (type === LibraryItemType.Novel || !writable || Object.keys(writable).length === 0) {
    return;
  }

  throw new BadRequestException(`An item of type \`${type}\` has nothing writable under metadata`);
}

/** The DTO already refuses the runner's statuses; the rule itself belongs here. */
function checkStatus(status?: LibraryItemStatus): void {
  if (status && !WRITABLE_STATUSES.includes(status)) {
    throw new BadRequestException(`\`${status}\` is the job runner's to set, not a client's`);
  }
}

/** `type` and `sourceMode` decide the item's shape, so neither can move under it. */
function checkImmutable(stored: LibraryItem, input: UpdateLibraryItemDto): void {
  if (input.type !== stored.type) {
    throw new BadRequestException(`This item is a ${stored.type}, and a type cannot be changed after creation`);
  }

  if (input.sourceMode !== stored.sourceMode) {
    throw new BadRequestException(`This item is ${stored.sourceMode}, and a source mode cannot be changed after creation`);
  }
}

/**
 * A row of the listing. Field by field rather than a spread, so what the listing
 * does not draw — `createdAt` — cannot arrive in it by accident.
 */
function listRow(item: LibraryItem): LibraryListItemDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    coverUrl: item.coverUrl,
    sourceMode: item.sourceMode,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    status: item.status,
    metadata: item.metadata,
    updatedAt: item.updatedAt,
  };
}

/** Across the title, the source name, and the author where the type has one. */
function matchesSearch(item: LibraryItem, search?: string): boolean {
  const needle = search?.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const author = item.type === LibraryItemType.Novel ? item.metadata.author : '';

  return [item.title, item.sourceName, author].some((field) => field.toLowerCase().includes(needle));
}

/** ISO strings, so lexicographic order is chronological order. */
function byRecentChange(one: LibraryItem, other: LibraryItem): number {
  return other.updatedAt.localeCompare(one.updatedAt);
}
