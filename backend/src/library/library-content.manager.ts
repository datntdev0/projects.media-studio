import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WRITABLE_CONTENT_STATUSES } from './dto/library-content.constants';
import { AudioContentDto, ImageContentDto, LibraryContentDto, LibraryContentPageDto, QueryListLibraryContentsDto, TextContentDto, VideoContentDto } from './dto/library-content.dto';
import { CreateLibraryContentDto } from './dto/library-content.dto-create';
import { UpdateLibraryContentDto } from './dto/library-content.dto-update';
import { AudioContent, ContentLanguages, ImageContent, LibraryContent, LibraryContentStatus, LibraryContentType, TextContent, VideoContent } from './entities/library-content.entity';
import { LibraryItem, LibraryItemType } from './entities/library-item.entity';
import { LibraryContentDraft, LibraryRepository } from './library.repository';

/** What every draft carries whatever its type: the root, minus what the repository stamps. */
type ContentRoot = Pick<LibraryContent, 'idx' | 'type' | 'status' | 'sourceUrl'>;

/** The four content blocks, as an update hands them over. */
interface ContentBlockInput {
  textContent?: TextContentDto | null;
  audioContent?: AudioContentDto | null;
  imageContent?: ImageContentDto | null;
  videoContent?: VideoContentDto | null;
}

/** Which content types a library item's type may hold. Audio narration is not built yet. */
const ALLOWED_CONTENT_TYPES: Record<LibraryItemType, LibraryContentType[]> = {
  [LibraryItemType.Novel]: [LibraryContentType.Original, LibraryContentType.Translation],
  [LibraryItemType.Image]: [LibraryContentType.Image],
  [LibraryItemType.Video]: [LibraryContentType.Video],
};

/**
 * The rules for one library item's content: which of the four blocks belongs to
 * which row type, what a request is refused for, and what a listing is narrowed
 * and searched by.
 *
 * Framework-free — the repository and nothing else — so its spec needs no Nest
 * fixture.
 */
@Injectable()
export class LibraryContentManager {
  constructor(private readonly repository: LibraryRepository) {}

  /**
   * One page of an item's content.
   *
   * Firestore orders it and narrows by `type` and `status`; the language match,
   * the search and the slice happen here, over what comes back — the same
   * bargain `LibraryItemManager.list` strikes for the item listing.
   */
  async list(itemId: string, query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    const item = await this.requireItem(itemId);

    checkLanguageAllowed(item.type, query.language);

    const matching = await this.repository.searchLibraryContents(itemId, { type: query.type, status: query.status });
    const found = matching.filter((content) => matchesLanguage(content, query.language) && matchesSearch(content, query.search));
    const from = (query.page - 1) * query.pageSize;

    return {
      items: found.slice(from, from + query.pageSize).map(toDto),
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(itemId: string, contentId: string): Promise<LibraryContentDto> {
    await this.requireItem(itemId);

    return toDto(await this.requireContent(itemId, contentId));
  }

  async create(itemId: string, input: CreateLibraryContentDto): Promise<LibraryContentDto> {
    const item = await this.requireItem(itemId);

    checkStatus(input.status);

    return toDto(await this.repository.createLibraryContent(itemId, draftOf(item.type, input)));
  }

  /** The whole writable representation, so an omitted field is a cleared field. */
  async replace(itemId: string, contentId: string, input: UpdateLibraryContentDto): Promise<LibraryContentDto> {
    const item = await this.requireItem(itemId);
    const stored = await this.requireContent(itemId, contentId);

    checkImmutable(stored, input);
    checkStatus(input.status);

    const updated = await this.repository.updateLibraryContent(itemId, contentId, draftOf(item.type, input));

    return toDto(updated);
  }

  async remove(itemId: string, contentId: string): Promise<void> {
    await this.requireItem(itemId);
    await this.requireContent(itemId, contentId);
    await this.repository.deleteLibraryContent(itemId, contentId);
  }

  /** The item, or the 404 every route that names one owes. */
  private async requireItem(itemId: string): Promise<LibraryItem> {
    const item = await this.repository.findLibrary(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    return item;
  }

  /** The row, or a 404. Content of another item is not reachable from here. */
  private async requireContent(itemId: string, contentId: string): Promise<LibraryContent> {
    const content = await this.repository.findLibraryContent(itemId, contentId);

    if (!content) {
      throw new NotFoundException(`No content ${contentId} in library item ${itemId}`);
    }

    return content;
  }
}

/**
 * A row as a create or a replace hands it over. `type` decides which of the
 * four blocks is read, and the other three are refused rather than ignored.
 */
function draftOf(itemType: LibraryItemType, input: CreateLibraryContentDto | UpdateLibraryContentDto): LibraryContentDraft {
  checkContentTypeAllowed(itemType, input.type);
  checkContentBlockMatchesType(input.type, input);

  const root: ContentRoot = { idx: input.idx, type: input.type, status: input.status, sourceUrl: input.sourceUrl ?? null };

  switch (input.type) {
    case LibraryContentType.Original:
    case LibraryContentType.Translation:
      return { ...root, type: input.type, ...textBlock(input) };
    case LibraryContentType.Audio:
      return { ...root, type: input.type, ...audioBlock(input) };
    case LibraryContentType.Image:
      return { ...root, type: input.type, ...imageBlock(input) };
    case LibraryContentType.Video:
      return { ...root, type: input.type, ...videoBlock(input) };
  }
}

/** Only a novel holds text, only an image set holds images, only a video set holds clips. */
function checkContentTypeAllowed(itemType: LibraryItemType, type: LibraryContentType): void {
  if (!ALLOWED_CONTENT_TYPES[itemType].includes(type)) {
    throw new BadRequestException(`A ${itemType} item has no content of type \`${type}\``);
  }
}

/**
 * Only the block matching `type` may be filled — a chapter carrying an asset's
 * fields, or the other way round, is a mistake worth saying out loud.
 */
function checkContentBlockMatchesType(type: LibraryContentType, input: ContentBlockInput): void {
  const isText = type === LibraryContentType.Original || type === LibraryContentType.Translation;
  const blocks: [boolean, string, unknown][] = [
    [isText, 'textContent', input.textContent],
    [type === LibraryContentType.Audio, 'audioContent', input.audioContent],
    [type === LibraryContentType.Image, 'imageContent', input.imageContent],
    [type === LibraryContentType.Video, 'videoContent', input.videoContent],
  ];

  const stray = blocks.filter(([matches, , value]) => !matches && value != null).map(([, field]) => field);

  if (stray.length > 0) {
    throw new BadRequestException(`Content of type \`${type}\` has no ${stray.join(', ')}`);
  }
}

function textBlock(input: ContentBlockInput): Pick<TextContent, 'contentUrl' | 'language' | 'title' | 'words'> {
  const title = input.textContent?.title?.trim();
  const language = input.textContent?.language;

  if (!title) {
    throw new BadRequestException('A chapter needs a title');
  }

  if (!language) {
    throw new BadRequestException('A chapter needs a language');
  }

  return { contentUrl: input.textContent?.contentUrl ?? null, language, title, words: input.textContent?.words ?? 0 };
}

function audioBlock(input: ContentBlockInput): Pick<AudioContent, 'contentUrl' | 'language' | 'subtitleUrl'> {
  const language = input.audioContent?.language;

  if (!language) {
    throw new BadRequestException('An audio track needs a language');
  }

  return { contentUrl: input.audioContent?.contentUrl ?? null, language, subtitleUrl: input.audioContent?.subtitleUrl ?? null };
}

function imageBlock(input: ContentBlockInput): Pick<ImageContent, 'contentUrl' | 'filename' | 'filesize' | 'dimensions'> {
  const filename = input.imageContent?.filename?.trim();

  if (!filename) {
    throw new BadRequestException('An image asset needs a filename');
  }

  return { contentUrl: input.imageContent?.contentUrl ?? null, filename, filesize: input.imageContent?.filesize ?? 0, dimensions: input.imageContent?.dimensions ?? '' };
}

function videoBlock(input: ContentBlockInput): Pick<VideoContent, 'contentUrl' | 'filename' | 'filesize' | 'dimensions' | 'duration'> {
  const filename = input.videoContent?.filename?.trim();

  if (!filename) {
    throw new BadRequestException('A video asset needs a filename');
  }

  return {
    contentUrl: input.videoContent?.contentUrl ?? null,
    filename,
    filesize: input.videoContent?.filesize ?? 0,
    dimensions: input.videoContent?.dimensions ?? '',
    duration: input.videoContent?.duration ?? 0,
  };
}

/** `WRITABLE_CONTENT_STATUSES` is the client's half — discovery and the job runner set the rest. */
function checkStatus(status: LibraryContentStatus): void {
  if (!WRITABLE_CONTENT_STATUSES.includes(status)) {
    throw new BadRequestException(`\`${status}\` is discovery's or the job runner's to set, not a client's`);
  }
}

/** `type` decides the row's shape, so it cannot move under it. */
function checkImmutable(stored: LibraryContent, input: UpdateLibraryContentDto): void {
  if (input.type !== stored.type) {
    throw new BadRequestException(`This content is a ${stored.type}, and a type cannot be changed after creation`);
  }
}

/** A `language` filter has nothing to match on an item whose content carries none. */
function checkLanguageAllowed(itemType: LibraryItemType, language?: ContentLanguages): void {
  if (language && itemType !== LibraryItemType.Novel) {
    throw new BadRequestException(`A \`language\` filter has nothing to match on a ${itemType} item`);
  }
}

/** Field by field rather than a spread, so a field the entity gains cannot arrive in a response by accident. */
function toDto(content: LibraryContent): LibraryContentDto {
  const isText = content.type === LibraryContentType.Original || content.type === LibraryContentType.Translation;

  return {
    id: content.id,
    idx: content.idx,
    type: content.type,
    status: content.status,
    sourceUrl: content.sourceUrl,
    textContent: isText ? { contentUrl: content.contentUrl, language: content.language, title: content.title, words: content.words } : null,
    audioContent: content.type === LibraryContentType.Audio ? { contentUrl: content.contentUrl, language: content.language, subtitleUrl: content.subtitleUrl } : null,
    imageContent: content.type === LibraryContentType.Image ? { contentUrl: content.contentUrl, filename: content.filename, filesize: content.filesize, dimensions: content.dimensions } : null,
    videoContent: content.type === LibraryContentType.Video
      ? { contentUrl: content.contentUrl, filename: content.filename, filesize: content.filesize, dimensions: content.dimensions, duration: content.duration }
      : null,
    createdAt: content.createdAt,
    updatedAt: content.updatedAt,
  };
}

/** Across a chapter's title, or an asset's filename — whichever the row is named by. */
function matchesSearch(content: LibraryContent, search?: string): boolean {
  const needle = search?.trim().toLowerCase();

  if (!needle) {
    return true;
  }

  const name = 'title' in content ? content.title : 'filename' in content ? content.filename : '';

  return name.toLowerCase().includes(needle);
}

/** Only a row with a language of its own — text or audio — can match one. */
function matchesLanguage(content: LibraryContent, language?: ContentLanguages): boolean {
  if (!language) {
    return true;
  }

  return 'language' in content && content.language === language;
}
