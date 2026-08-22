import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LibraryContentDto, LibraryContentPageDto, QueryListLibraryContentsDto } from './dto/library-content.dto';
import { CreateLibraryContentDto } from './dto/library-content.dto-create';
import { UpdateLibraryContentDto } from './dto/library-content.dto-update';
import { LibraryItemDto, LibraryItemPageDto, QueryListLibraryItemsDto } from './dto/library-item.dto';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { UpdateLibraryItemDto } from './dto/library-item.dto-update';
import { LibraryContentManager } from './library-content.manager';
import { LibraryItemManager } from './library-item.manager';

/** Every route naming an item that is not there says so the same way. */
const NOT_FOUND = 'No item under that id.';

/** The same, one level down: the item, or the row under it. */
const CONTENT_NOT_FOUND = 'No item under that id, or no content under that one.';

/** The description for the unauthorized response. */
const UNAUTHORIZED = 'Missing or invalid ID token.';

/** Only a novel's content carries a `language` of its own. */
const WRONG_LANGUAGE = 'A `language` filter that has nothing to match on an image or video item.';

/** The shape of a row depends on the item's type, so responses say all four. */
const WRONG_FIELDS = 'A content type the item does not hold, fields belonging to a type the row is not, or a chapter without a title or a language.';

/** `discovered`, `inprogress` and `failed` are discovery's and the job runner's to set. */
const WRONG_STATUS = 'A status only discovery or the job runner may set.';

/**
 * The library controller handles CRUD operations for library items and their contents.
 */
@ApiTags('Library')
@Controller("library")
export class LibraryController {
  constructor(
    private readonly libraryItemManager: LibraryItemManager,
    private readonly libraryContentManager: LibraryContentManager
  ) {}

  @Get()
  @ApiOkResponse({ type: LibraryItemPageDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  list(@Query() query: QueryListLibraryItemsDto): Promise<LibraryItemPageDto> {
    return this.libraryItemManager.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'A crawler item without its URL or crawler, a manual one with a URL, or metadata on an item that has none writable.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  create(@Body() item: CreateLibraryItemDto): Promise<LibraryItemDto> {
    return this.libraryItemManager.create(item);
  }

  @Get(':id')
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(@Param('id') id: string): Promise<LibraryItemDto> {
    return this.libraryItemManager.get(id);
  }

  @Put(':id')
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'The creation rules, plus a changed `type` or `sourceMode`, or a status only the job runner may set.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  replace(@Param('id') id: string, @Body() item: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    return this.libraryItemManager.replace(id, item);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted, and every chapter, image or clip filed under it with it.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  remove(@Param('id') id: string): Promise<void> {
    return this.libraryItemManager.remove(id);
  }

  @Get(':id/contents')
  @ApiOkResponse({ type: LibraryContentPageDto })
  @ApiBadRequestResponse({ description: WRONG_LANGUAGE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  listContents(@Param('id') id: string, @Query() query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    return this.libraryContentManager.list(id, query);
  }

  @Post(':id/contents')
  @ApiCreatedResponse({ type: LibraryContentDto })
  @ApiBadRequestResponse({ description: `${WRONG_FIELDS} ${WRONG_STATUS}` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  createContent(@Param('id') id: string, @Body() content: CreateLibraryContentDto): Promise<LibraryContentDto> {
    return this.libraryContentManager.create(id, content);
  }

  @Get(':id/contents/:contentId')
  @ApiOkResponse({ type: LibraryContentDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  getContent(@Param('id') id: string, @Param('contentId') contentId: string): Promise<LibraryContentDto> {
    return this.libraryContentManager.get(id, contentId);
  }

  @Put(':id/contents/:contentId')
  @ApiOkResponse({ type: LibraryContentDto })
  @ApiBadRequestResponse({ description: `${WRONG_FIELDS} ${WRONG_STATUS} A changed \`type\` is refused too.` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  replaceContent(@Param('id') id: string, @Param('contentId') contentId: string, @Body() content: UpdateLibraryContentDto): Promise<LibraryContentDto> {
    return this.libraryContentManager.replace(id, contentId, content);
  }

  @Delete(':id/contents/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted. The stored bytes are not — whoever uploaded them drops them.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  removeContent(@Param('id') id: string, @Param('contentId') contentId: string): Promise<void> {
    return this.libraryContentManager.remove(id, contentId);
  }
}
