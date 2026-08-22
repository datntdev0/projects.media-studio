import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WRITABLE_STATUSES } from './dto/library-item.constants';
import { ImageSetMetadataDto, LibraryItemDto, LibraryItemPageDto, NovelMetadataDto, QueryListLibraryItemsDto, VideoSetMetadataDto } from './dto/library-item.dto';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { UpdateLibraryItemDto } from './dto/library-item.dto-update';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelMetadata, NovelStatus } from './entities/library-item.entity';
import { LibraryRepository } from './library.repository';

/** What a manual item's source is called — it is its own. */
const MANUAL_SOURCE = 'Manual';

/** An item as a caller hands it over — the id and the dates are this class's to stamp. */
type LibraryItemDraft = Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>;

/** What every draft carries whatever its type: the root, minus the three metadata slots. */
type LibraryItemRoot = Omit<LibraryItemDraft, 'novelMetadata' | 'imageMetadata' | 'videoMetadata'>;

/** The three metadata slots, as a create or an update hands them over. */
interface MetadataInput {
  novelMetadata?: NovelMetadataDto | null;
  imageMetadata?: ImageSetMetadataDto | null;
  videoMetadata?: VideoSetMetadataDto | null;
}

/**
 * The library's rules: what a client may decide, what the server decides for it,
 * and what a request is refused for.
 *
 * Framework-free — no request, no response, nothing but the repository — so its
 * spec needs no Nest fixture.
 */
@Injectable()
export class LibraryItemManager {
  constructor(private readonly repository: LibraryRepository) {}

  /**
   * One page of the listing.
   *
   * Firestore narrows by the three enums it is indexed on; the search, the
   * ordering and the slice happen here, over what comes back. That is what keeps
   * the collection free of composite indexes — and what makes the repository's
   * scan limit the honest ceiling on the catalogue's size.
   */
  async list(query: QueryListLibraryItemsDto): Promise<LibraryItemPageDto> {
    const matching = await this.repository.searchLibraries({ type: query.type, status: query.status, sourceMode: query.sourceMode });
    const found = matching.filter((item) => matchesSearch(item, query.search)).sort(byRecentChange);
    const from = (query.page - 1) * query.pageSize;

    return {
      items: found.slice(from, from + query.pageSize).map(toDto),
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** The read half of CRUD — what refreshes a row after an edit. */
  async get(id: string): Promise<LibraryItemDto> {
    return toDto(await this.require(id));
  }

  async create(input: CreateLibraryItemDto): Promise<LibraryItemDto> {
    checkMetadataMatchesType(input.type, input);
    checkStatus(input.status);

    const root: LibraryItemRoot = {
      type: input.type,
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      status: input.status,
      ...source(input),
    };

    return toDto(await this.repository.createLibrary(newDraft(input.type, root, input)));
  }

  /** The whole writable representation, so an omitted field is a cleared field. */
  async replace(id: string, input: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    const stored = await this.require(id);

    checkImmutable(stored, input);
    checkStatus(input.status);
    checkMetadataMatchesType(stored.type, input);

    const root: LibraryItemRoot = {
      type: stored.type,
      title: input.title,
      coverUrl: input.coverUrl ?? null,
      status: input.status,
      ...source(input),
    };

    const updated = await this.repository.updateLibrary(id, { ...stored, ...nextDraft(stored, root, input) });

    return toDto(updated);
  }

  /** The item. Every chapter, image or clip filed under it is another team's cascade. */
  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.repository.deleteLibrary(id);
  }

  /** The item, or the 404 every route that names one owes. */
  private async require(id: string): Promise<LibraryItem> {
    const item = await this.repository.findLibrary(id);

    if (!item) {
      throw new NotFoundException(`No library item ${id}`);
    }

    return item;
  }
}

/**
 * A brand new item's metadata: the editable block, over nothing downloaded. Part 1
 * has nothing that would fetch anything, so every downloaded counter starts at 0.
 */
function newDraft(type: LibraryItemType, root: LibraryItemRoot, input: MetadataInput): LibraryItemDraft {
  return {
    ...root,
    novelMetadata: type === LibraryItemType.Novel ? newNovelMetadata(input.novelMetadata) : null,
    imageMetadata: type === LibraryItemType.Image ? { ...inventory(input.imageMetadata), downloadedCount: 0, downloadedSize: 0 } : null,
    videoMetadata: type === LibraryItemType.Video ? { ...inventory(input.videoMetadata), downloadedCount: 0, downloadedSize: 0, downloadedDuration: 0 } : null,
  };
}

/**
 * The stored item, rewritten. What we hold is carried over rather than read from
 * the request — `downloadedCount` and the two sizes say what is actually stored
 * here, and an update able to zero them would let a client erase that.
 *
 * The inventory is not: it is editable, so `PUT` treats it like every other
 * editable field and a body that leaves it out clears it.
 */
function nextDraft(stored: LibraryItem, root: LibraryItemRoot, input: MetadataInput): LibraryItemDraft {
  return {
    ...root,
    novelMetadata: stored.type === LibraryItemType.Novel ? nextNovelMetadata(stored.novelMetadata!, input.novelMetadata) : null,
    imageMetadata: stored.type === LibraryItemType.Image ? { ...inventory(input.imageMetadata), downloadedCount: stored.imageMetadata!.downloadedCount, downloadedSize: stored.imageMetadata!.downloadedSize } : null,
    videoMetadata: stored.type === LibraryItemType.Video ? { ...inventory(input.videoMetadata), downloadedCount: stored.videoMetadata!.downloadedCount, downloadedSize: stored.videoMetadata!.downloadedSize, downloadedDuration: stored.videoMetadata!.downloadedDuration } : null,
  };
}

function newNovelMetadata(writable?: NovelMetadataDto | null): NovelMetadata {
  return { ...inventory(writable), downloadedCount: 0, ...novelBlock(writable) };
}

function nextNovelMetadata(stored: NovelMetadata, writable?: NovelMetadataDto | null): NovelMetadata {
  return { ...inventory(writable), downloadedCount: stored.downloadedCount, ...novelBlock(writable) };
}

/** What the source is said to hold — a client may state it; what we hold, it may not. */
function inventory(writable?: { discoveredCount?: number; discoveredAt?: string | null } | null): Pick<NovelMetadata, 'discoveredCount' | 'discoveredAt'> {
  return { discoveredCount: writable?.discoveredCount ?? 0, discoveredAt: writable?.discoveredAt ?? null };
}

/** Each field cleared where the request left it out — that is what `PUT` promises. */
function novelBlock(writable?: NovelMetadataDto | null): Pick<NovelMetadata, 'status' | 'author' | 'language' | 'genres' | 'description'> {
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
function source(input: CreateLibraryItemDto | UpdateLibraryItemDto): Pick<LibraryItemRoot, 'sourceMode' | 'sourceName' | 'sourceUrl'> {
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
 * Only the metadata slot matching `type` may be filled — a set carrying a novel's
 * block, or the other way round, is a mistake worth saying out loud rather than
 * ignoring.
 */
function checkMetadataMatchesType(type: LibraryItemType, input: MetadataInput): void {
  const slots: [LibraryItemType, string, unknown][] = [
    [LibraryItemType.Novel, 'novelMetadata', input.novelMetadata],
    [LibraryItemType.Image, 'imageMetadata', input.imageMetadata],
    [LibraryItemType.Video, 'videoMetadata', input.videoMetadata],
  ];

  const stray = slots.filter(([ofType, , value]) => ofType !== type && value != null).map(([, field]) => field);

  if (stray.length > 0) {
    throw new BadRequestException(`An item of type \`${type}\` has no ${stray.join(', ')}`);
  }
}

/** `WRITABLE_STATUSES` is the client's half — the job runner sets the rest. */
function checkStatus(status: LibraryItemStatus): void {
  if (!WRITABLE_STATUSES.includes(status)) {
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

/** Field by field rather than a spread, so a field the entity gains cannot arrive in a response by accident. */
function toDto(item: LibraryItem): LibraryItemDto {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    status: item.status,
    sourceMode: item.sourceMode,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    coverUrl: item.coverUrl,
    novelMetadata: item.novelMetadata,
    imageMetadata: item.imageMetadata,
    videoMetadata: item.videoMetadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Across the title, the source name, and the author where the type has one. */
function matchesSearch(item: LibraryItem, search?: string): boolean {
  const needle = search?.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const author = item.type === LibraryItemType.Novel ? item.novelMetadata!.author : '';

  return [item.title, item.sourceName, author].some((field) => field.toLowerCase().includes(needle));
}

/** ISO strings, so lexicographic order is chronological order. */
function byRecentChange(one: LibraryItem, other: LibraryItem): number {
  return other.updatedAt.localeCompare(one.updatedAt);
}
