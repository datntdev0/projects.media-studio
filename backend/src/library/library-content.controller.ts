import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiExtraModels, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LIBRARY_CONTENT_PATH, LIBRARY_PATH } from '../core/api.constants';
import { CreateLibraryContentDto } from './dto/create-library-content.dto';
import { CONTENT_ONE_OF, ImageAssetDto, LibraryContentPageDto, NovelChapterDto, VideoAssetDto } from './dto/library-content.dto';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { UpdateLibraryContentDto } from './dto/update-library-content.dto';
import { LibraryContent } from './entities/library-content.entity';
import { LibraryContentManager } from './library-content.manager';

/** Every route below names an item, and a row under it, the same way. */
const NOT_FOUND = 'No item under that id, or no content under that one.';

const UNAUTHORIZED = 'Missing or invalid ID token.';

/** The shape of a row depends on the item's type, so responses say all three. */
const ONE_ROW = { schema: { oneOf: CONTENT_ONE_OF } };

const WRONG_FIELDS = 'Fields belonging to a type the item is not — a filename on a chapter, an index on an asset — or a chapter without a title.';

/**
 * `/api/v1/library/:itemId/contents/…` — what an item holds: a novel's chapters,
 * an image set's images, a video set's clips.
 *
 * HTTP and nothing else, as `LibraryController` is. The bytes never come through
 * here: the browser puts them in Cloud Storage and sends the URL.
 */
@ApiTags('Library content')
@ApiBearerAuth()
@ApiExtraModels(NovelChapterDto, ImageAssetDto, VideoAssetDto)
@UseGuards(FirebaseAuthGuard)
@Controller(`${LIBRARY_PATH}/:itemId/${LIBRARY_CONTENT_PATH}`)
export class LibraryContentController {
  constructor(private readonly contents: LibraryContentManager) {}

  @Get()
  @ApiOperation({ summary: "One item's content — chapters by their number, assets by their name" })
  @ApiOkResponse({ type: LibraryContentPageDto })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  list(@Param('itemId') itemId: string, @Query() query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    return this.contents.list(itemId, query);
  }

  @Get(':contentId')
  @ApiOperation({ summary: 'One chapter, image or clip' })
  @ApiOkResponse(ONE_ROW)
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  get(@Param('itemId') itemId: string, @Param('contentId') contentId: string): Promise<LibraryContent> {
    return this.contents.get(itemId, contentId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a chapter, image or clip' })
  @ApiCreatedResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  create(@Param('itemId') itemId: string, @Body() content: CreateLibraryContentDto): Promise<LibraryContent> {
    return this.contents.create(itemId, content);
  }

  @Put(':contentId')
  @ApiOperation({ summary: "Replace a row's whole writable representation" })
  @ApiOkResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  replace(@Param('itemId') itemId: string, @Param('contentId') contentId: string, @Body() content: UpdateLibraryContentDto): Promise<LibraryContent> {
    return this.contents.replace(itemId, contentId, content);
  }

  @Delete(':contentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chapter, image or clip' })
  @ApiNoContentResponse({ description: 'Deleted. The stored bytes are not — whoever uploaded them drops them.' })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  remove(@Param('itemId') itemId: string, @Param('contentId') contentId: string): Promise<void> {
    return this.contents.remove(itemId, contentId);
  }
}
