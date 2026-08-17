import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiExtraModels, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiUnprocessableEntityResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { LIBRARY_CONTENT_PATH, LIBRARY_EXPORT_PATH, LIBRARY_IMPORT_PATH, LIBRARY_PATH } from '../core/api.constants';
import { CreateLibraryContentDto } from './dto/library-content-create.dto';
import { UpdateLibraryContentDto } from './dto/library-content-update.dto';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { CONTENT_ONE_OF, ImageAssetDto, LibraryContentPageDto, NovelChapterDto, VideoAssetDto } from './dto/library-content.dto';
import { LibraryItemDto } from './dto/library-item.dto';
import { LibraryItemPageDto } from './dto/library-item-list.dto';
import { LibraryImportDto, LibraryPackageDto, LibraryPackageRefDto, LibraryPackageReportDto, StartLibraryImportDto } from './dto/library-package.dto';
import { QueryContentLanguageDto } from './dto/query-content-language.dto';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { QueryListLibraryItemsDto } from './dto/query-list-library-items.dto';
import { UpdateLibraryItemDto } from './dto/library-item-update.dto';
import { TranslatedContent } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryExportManager } from './library-export.manager';
import { LibraryImportManager } from './library-import.manager';
import { LibraryManager } from './library.manager';

/** Every route naming an item that is not there says so the same way. */
const NOT_FOUND = 'No item under that id.';

/** The same, one level down: the item, or the row under it. */
const CONTENT_NOT_FOUND = 'No item under that id, or no content under that one.';

const UNAUTHORIZED = 'Missing or invalid ID token.';

/** The shape of a row depends on the item's type, so responses say all three. */
const ONE_ROW = { schema: { oneOf: CONTENT_ONE_OF } };

const WRONG_FIELDS = 'Fields belonging to a type the item is not — a filename on a chapter, an index on an asset — or a chapter without a title.';

/** Only a novel is translated, so only a novel's routes take a `language`. */
const WRONG_LANGUAGE = 'A `language` on an image or video set, or one that is not a language we translate into.';

/** A set's package is its bytes, which is a different part — see the part 5 plan. */
const NOT_PACKAGEABLE = 'An image or video set. Only a novel can be packaged.';

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
    private readonly packages: LibraryExportManager,
    private readonly imports: LibraryImportManager,
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

  @Post(`:id/${LIBRARY_EXPORT_PATH}`)
  // It writes an archive, but not a resource the caller addresses afterwards — the
  // same reading `POST /scrapings/validate` takes, and the same 200.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pack an item's metadata, chapters and translations into a .zip" })
  @ApiOkResponse({ type: LibraryPackageDto, description: 'Filed in the bucket. Open `url` to download it.' })
  @ApiBadRequestResponse({ description: NOT_PACKAGEABLE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiUnprocessableEntityResponse({ description: 'A chapter points at text that is not in storage. The item is packable once that row is fixed.' })
  export(@Param('id') id: string): Promise<LibraryPackageDto> {
    return this.packages.export(id);
  }

  @Post(`:id/${LIBRARY_IMPORT_PATH}/validate`)
  // Nothing is written, and nothing is addressable afterwards — a POST because the
  // question is asked with a body, and a 200 because there is no new resource.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Say what an uploaded package holds, and what importing it would do' })
  @ApiOkResponse({ type: LibraryPackageReportDto, description: 'Read, compared against this item, and nothing written. A warning does not stop an import; a failure does.' })
  @ApiBadRequestResponse({ description: `${NOT_PACKAGEABLE} A URL that is not an object in this bucket, or a package that will not open.` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  validateImport(@Param('id') id: string, @Body() packaged: LibraryPackageRefDto): Promise<LibraryPackageReportDto> {
    return this.imports.validate(id, packaged.packageUrl);
  }

  @Post(`:id/${LIBRARY_IMPORT_PATH}`)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Unpack a package into this item, or into a new one, in the background' })
  @ApiAcceptedResponse({ type: LibraryImportDto, description: 'Queued. Watch `libraryImports/{itemId}` in the Realtime Database for how far it has got.' })
  @ApiBadRequestResponse({ description: `${NOT_PACKAGEABLE} A package that will not open, or one whose report is not valid.` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: NOT_FOUND })
  @ApiConflictResponse({ description: 'An import is already running over this item.' })
  startImport(@Param('id') id: string, @Body() input: StartLibraryImportDto): Promise<LibraryImportDto> {
    return this.imports.start(id, input);
  }

  @Get(CONTENTS)
  @ApiOperation({ summary: "One item's content — chapters by their number, assets by their name" })
  @ApiOkResponse({ type: LibraryContentPageDto })
  @ApiBadRequestResponse({ description: WRONG_LANGUAGE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  listContents(@Param('itemId') itemId: string, @Query() query: QueryListLibraryContentsDto): Promise<LibraryContentPageDto> {
    return this.contents.list(itemId, query);
  }

  @Get(`${CONTENTS}/:contentId`)
  @ApiOperation({ summary: 'One chapter, image or clip' })
  @ApiOkResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_LANGUAGE })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  getContent(@Param('itemId') itemId: string, @Param('contentId') contentId: string, @Query() query: QueryContentLanguageDto): Promise<TranslatedContent> {
    return this.contents.get(itemId, contentId, query.language);
  }

  @Post(CONTENTS)
  @ApiOperation({ summary: 'Add a chapter, image or clip' })
  @ApiCreatedResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: WRONG_FIELDS })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  createContent(@Param('itemId') itemId: string, @Body() content: CreateLibraryContentDto): Promise<TranslatedContent> {
    return this.contents.create(itemId, content);
  }

  @Put(`${CONTENTS}/:contentId`)
  @ApiOperation({ summary: "Replace a row's whole writable representation, or write a translation of it" })
  @ApiOkResponse(ONE_ROW)
  @ApiBadRequestResponse({ description: `${WRONG_FIELDS} ${WRONG_LANGUAGE}` })
  @ApiUnauthorizedResponse({ description: UNAUTHORIZED })
  @ApiNotFoundResponse({ description: CONTENT_NOT_FOUND })
  replaceContent(@Param('itemId') itemId: string, @Param('contentId') contentId: string, @Body() content: UpdateLibraryContentDto, @Query() query: QueryContentLanguageDto): Promise<TranslatedContent> {
    return this.contents.replace(itemId, contentId, content, query.language);
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
