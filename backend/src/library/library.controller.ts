import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LIBRARY_PATH } from '../core/api.constants';
import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { LibraryItemDto } from './dto/library-item.dto';
import { LibraryItemPageDto } from './dto/library-list-item.dto';
import { QueryListLibraryItemsDto } from './dto/query-list-library-items.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { LibraryManager } from './library.manager';

/** Every route below names an item that is not there the same way. */
const NOT_FOUND = 'No item under that id.';

const UNAUTHORIZED = 'Missing or invalid ID token.';

/**
 * `/api/v1/library/…` — the catalogue: novels, image sets and video sets.
 *
 * HTTP and nothing else. The rules, the defaults and the paging are the manager's,
 * and Firestore is the repository's; this file knows status codes and DTOs.
 */
@ApiTags('Library')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller(LIBRARY_PATH)
export class LibraryController {
  constructor(private readonly library: LibraryManager) {}

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
  @ApiNoContentResponse({ description: 'Deleted. Its content is not — part 1 stores none.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  remove(@Param('id') id: string): Promise<void> {
    return this.library.remove(id);
  }
}
