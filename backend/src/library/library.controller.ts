import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotImplementedException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LibraryContentDto, LibraryContentPageDto, QueryListLibraryContentsDto } from './dto/library-content.dto';
import { CreateLibraryContentDto } from './dto/library-content.dto-create';
import { UpdateLibraryContentDto } from './dto/library-content.dto-update';
import { LibraryItemDto, LibraryItemPageDto, QueryListLibraryItemsDto } from './dto/library-item.dto';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { UpdateLibraryItemDto } from './dto/library-item.dto-update';
import { LibraryManager } from './library.manager';

/** Every route naming an item that is not there says so the same way. */
const NOT_FOUND = 'No item under that id.';

/** The same, one level down: the item, or the row under it. */
const CONTENT_NOT_FOUND = 'No item under that id, or no content under that one.';

const UNAUTHORIZED = 'Missing or invalid ID token.';

/** The shape of a row depends on the item's type, so responses say all three. */
const WRONG_FIELDS = 'Fields belonging to a type the item is not — a filename on a chapter, an index on an asset — or a chapter without a title.';

/** Only a novel is translated, so only a novel's routes take a `language`. */
const WRONG_LANGUAGE = 'A `language` on an image or video set, or one that is not a language we translate into.';

/**
 * The library controller handles CRUD operations for library items and their contents.
 */
@ApiTags('Library')
@Controller("library")
export class LibraryController {
  constructor(private readonly manager: LibraryManager) {}

  @Get()
  @ApiOkResponse({ type: LibraryItemPageDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  list(@Query() query: QueryListLibraryItemsDto): Promise<LibraryItemPageDto> {
    return this.manager.list(query);
  }

  @Post()
  @ApiCreatedResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'A crawler item without its URL or crawler, a manual one with a URL, or metadata on an item that has none writable.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  create(@Body() item: CreateLibraryItemDto): Promise<LibraryItemDto> {
    return this.manager.create(item);
  }

  @Get(':id')
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(@Param('id') id: string): Promise<LibraryItemDto> {
    return this.manager.get(id);
  }

  @Put(':id')
  @ApiOkResponse({ type: LibraryItemDto })
  @ApiBadRequestResponse({ description: 'The creation rules, plus a changed `type` or `sourceMode`, or a status only the job runner may set.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  replace(@Param('id') id: string, @Body() item: UpdateLibraryItemDto): Promise<LibraryItemDto> {
    return this.manager.replace(id, item);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted, and every chapter, image or clip filed under it with it.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  remove(@Param('id') id: string): Promise<void> {
    return this.manager.remove(id);
  }

  @Get(':id/contents')
  @ApiOkResponse({ type: LibraryContentPageDto })
  @ApiBadRequestResponse({ description: WRONG_LANGUAGE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  listContents(@Param('id') _id: string, @Query() _query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    throw new NotImplementedException();
  }

  @Post(':id/contents')
  @ApiCreatedResponse({ type: LibraryContentDto })
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  createContent(@Param('id') _id: string, @Body() _content: CreateLibraryContentDto): Promise<LibraryContentDto> {
    throw new NotImplementedException();
  }

  @Get(':id/contents/:contentId')
  @ApiOkResponse({ type: LibraryContentDto })
  @ApiBadRequestResponse({ description: WRONG_LANGUAGE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  getContent(@Param('id') _id: string, @Param('contentId') _contentId: string): Promise<LibraryContentDto> {
    throw new NotImplementedException();
  }
  
  @Put(':id/contents/:contentId')
  @ApiOkResponse({ type: LibraryContentDto })
  @ApiBadRequestResponse({ description: `${WRONG_FIELDS} ${WRONG_LANGUAGE}` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  replaceContent(@Param('id') _id: string, @Param('contentId') _contentId: string, @Body() _content: UpdateLibraryContentDto): Promise<LibraryContentDto> {
    throw new NotImplementedException();
  }

  @Delete(':id/contents/:contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted. The stored bytes are not — whoever uploaded them drops them.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  removeContent(@Param('id') _id: string, @Param('contentId') _contentId: string): Promise<void> {
    throw new NotImplementedException();
  }
}
