import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiExtraModels, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LIBRARY_CONTENT_PATH, LIBRARY_PATH } from '../core/api.constants';
import { CreateLibraryContentDto } from './dto/library-content-create.dto';
import { UpdateLibraryContentDto } from './dto/library-content-update.dto';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { CONTENT_ONE_OF, ImageAssetDto, LibraryContentPageDto, NovelChapterDto, VideoAssetDto } from './dto/library-content.dto';
import { LibraryItemDto } from './dto/library-item.dto';
import { LibraryItemPageDto } from './dto/library-item-list.dto';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { QueryListLibraryItemsDto } from './dto/query-list-library-items.dto';
import { UpdateLibraryItemDto } from './dto/library-item-update.dto';
import { LibraryContent } from './entities/library-content.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryManager } from './library.manager';

/** Every route naming an item that is not there says so the same way. */
const NOT_FOUND = 'No item under that id.';

/** The same, one level down: the item, or the row under it. */
const CONTENT_NOT_FOUND = 'No item under that id, or no content under that one.';

const UNAUTHORIZED = 'Missing or invalid ID token.';

/** The shape of a row depends on the item's type, so responses say all three. */
const ONE_ROW = { schema: { oneOf: CONTENT_ONE_OF } };

const WRONG_FIELDS = 'Fields belonging to a type the item is not — a filename on a chapter, an index on an asset — or a chapter without a title.';

/** `:itemId/contents`, under the item it belongs to. */
const CONTENTS = `:itemId/${LIBRARY_CONTENT_PATH}`;

/**
 * `/api/v1/library/…` — the catalogue: novels, image sets and video sets, and
 * what each one holds.
 *
 * One controller for both, because content is not addressable apart from its
 * item: every route below `:itemId/contents` names the item first, and a client
 * that can reach one can reach the other. The bytes never come through here —
 * the browser puts them in Cloud Storage and sends the URL.
 *
 * HTTP and nothing else. The rules, the defaults and the paging are the managers',
 * and Firestore is the repositories'; this file knows status codes and DTOs.
 */
@ApiTags('Library')
@ApiBearerAuth()
@ApiExtraModels(NovelChapterDto, ImageAssetDto, VideoAssetDto)
@UseGuards(FirebaseAuthGuard)
@Controller(LIBRARY_PATH)
export class LibraryController {
  constructor(
    private readonly library: LibraryManager,
    private readonly contents: LibraryContentManager,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The items matching a filter, most recently changed first' })
  @ApiOkResponse({ type: LibraryItemPageDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  list(@Query() query: QueryListLibraryItemsDto): Promise<LibraryItemPageDto> {
    return this.library.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One item' })
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(@Param('id') id: string): Promise<LibraryItemDto> {
    return this.library.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Add an item' })
  @ApiCreatedResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'A crawler item without its URL or crawler, a manual one with a URL, or metadata on an item that has none writable.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  create(@Body() item: CreateLibraryItemDto): Promise<LibraryItemDto> {
    return this.library.create(item);
  }

  @Put(':id')
  @ApiOperation({ summary: "Replace an item's whole writable representation" })
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'The creation rules, plus a changed `type` or `sourceMode`, or a status only the job runner may set.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  replace(@Param('id') id: string, @Body() item: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    return this.library.replace(id, item);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an item' })
  @ApiNoContentResponse({ description: 'Deleted, and every chapter, image or clip filed under it with it.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  remove(@Param('id') id: string): Promise<void> {
    return this.library.remove(id);
  }

  @Get(CONTENTS)
  @ApiOperation({ summary: "One item's content — chapters by their number, assets by their name" })
  @ApiOkResponse({ type: LibraryContentPageDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  listContents(@Param('itemId') itemId: string, @Query() query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    return this.contents.list(itemId, query);
  }

  @Get(`${CONTENTS}/:contentId`)
  @ApiOperation({ summary: 'One chapter, image or clip' })
  @ApiOkResponse(ONE_ROW)
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  getContent(@Param('itemId') itemId: string, @Param('contentId') contentId: string): Promise<LibraryContent> {
    return this.contents.get(itemId, contentId);
  }

  @Post(CONTENTS)
  @ApiOperation({ summary: 'Add a chapter, image or clip' })
  @ApiCreatedResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  createContent(@Param('itemId') itemId: string, @Body() content: CreateLibraryContentDto): Promise<LibraryContent> {
    return this.contents.create(itemId, content);
  }

  @Put(`${CONTENTS}/:contentId`)
  @ApiOperation({ summary: "Replace a row's whole writable representation" })
  @ApiOkResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  replaceContent(@Param('itemId') itemId: string, @Param('contentId') contentId: string, @Body() content: UpdateLibraryContentDto): Promise<LibraryContent> {
    return this.contents.replace(itemId, contentId, content);
  }

  @Delete(`${CONTENTS}/:contentId`)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chapter, image or clip' })
  @ApiNoContentResponse({ description: 'Deleted. The stored bytes are not — whoever uploaded them drops them.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  removeContent(@Param('itemId') itemId: string, @Param('contentId') contentId: string): Promise<void> {
    return this.contents.remove(itemId, contentId);
  }
}
