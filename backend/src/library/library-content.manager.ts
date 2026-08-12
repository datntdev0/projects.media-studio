import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateLibraryContentDto } from './dto/create-library-content.dto';
import { LibraryContentPageDto } from './dto/library-content.dto';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { UpdateLibraryContentDto } from './dto/update-library-content.dto';
import { ImageAsset, LibraryContent, LibraryContentBase, LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType } from './entities/library-item.entity';
import { LibraryContentDraft, LibraryContentRepository } from './library-content.repository';
import { LibraryRepository } from './library.repository';

/** What every draft carries whatever its type: the root, minus what the repository stamps. */
type ContentRoot = Omit<LibraryContentBase, 'id' | 'createdAt' | 'updatedAt'>;

/** The fields a chapter adds, once the request has been checked for them. */
type ChapterBlock = Pick<NovelChapter, 'title' | 'language' | 'words'>;

/** The fields an asset adds, likewise. */
type AssetBlock = Pick<ImageAsset, 'filename' | 'filesize'>;

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
  constructor(private readonly contents: LibraryContentRepository, private readonly items: LibraryRepository) {}

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
  private async recount(item: LibraryItem): Promise<void> {
    const counts = await this.contents.counts(item.id);

    await this.items.updateCounters(item.id, {
      discoveredCount: counts.total,
      downloadedCount: counts.ready,
      // A novel's metadata has no size field, so it is left out rather than added.
      downloadedSize: item.type === LibraryItemType.Novel ? undefined : counts.bytes,
    });
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
  const root = rootOf(input);

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
 * What the row is, whatever its type: where its bytes are, and therefore where it
 * stands. `status` is derived rather than sent — a row with a URL holds something
 * and a row without one does not, and no third answer is a client's to give.
 */
function rootOf(input: CreateLibraryContentDto): ContentRoot {
  const contentUrl = input.contentUrl ?? null;

  return { contentUrl, status: contentUrl ? LibraryContentStatus.Ready : LibraryContentStatus.Pending };
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
