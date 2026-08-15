import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiNotImplementedResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { SCRAPING_JOBS_PATH, SCRAPING_PATH } from '../core/api.constants';
import { LibraryItemDto } from '../library/dto/library-item.dto';
import { DiscoverDto } from './dto/discover.dto';
import { PreviewDto } from './dto/preview.dto';
import { QueryListScrapingJobsDto } from './dto/query-list-scraping-jobs.dto';
import { CreateScrapingJobDto, ScrapingJobDto, ScrapingJobPageDto, UpdateScrapingJobStatusDto } from './dto/scraping-job.dto';
import { QueryValidateDto, ValidateDto } from './dto/validate.dto';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingManager } from './scraping.manager';

/**
 * `/api/v1/scrapings/…` — reading a source before anything is created from it.
 *
 * HTTP and nothing else. Which crawler exists, what a source says and what is
 * worth caching are the manager's; this file knows status codes and DTOs.
 */
@ApiTags('Scraping')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller(SCRAPING_PATH)
export class ScrapingController {
  constructor(
    private readonly scraping: ScrapingManager,
    private readonly jobs: ScrapingJobManager,
  ) {}

  @Post('validate')
  // A POST that creates nothing: it answers a question about a source, and the
  // cache entry it may write is not a resource a caller can address.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Read a source, and answer with what the preview screen draws' })
  @ApiOkResponse({ type: PreviewDto })
  @ApiBadRequestResponse({ description: "A URL that is not on the crawler's own site." })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No crawler under that name, or no book at that URL.' })
  @ApiBadGatewayResponse({ description: 'The source or the browser behind the scraping service failed.' })
  @ApiServiceUnavailableResponse({ description: 'The scraping service did not answer, or did not answer in time.' })
  validate(@Body() input: ValidateDto, @Query() query: QueryValidateDto): Promise<PreviewDto> {
    return this.scraping.validate(input, query.refresh);
  }

  @Post('discover')
  // It writes rows, but none of them is a resource the caller addresses — so 200
  // rather than 201, and the item is what comes back.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Read an item's source, and append the content it turns out to hold" })
  @ApiOkResponse({ type: LibraryItemDto, description: 'Read, compared, appended. The counters are as they now stand.' })
  @ApiBadRequestResponse({ description: "A manual item — it has no source to read — or a `sourceUrl` that is not on the crawler's own site." })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No item under that id, no crawler under its `sourceName`, or no book at its URL.' })
  @ApiNotImplementedResponse({ description: 'A crawler item that is not a novel.' })
  @ApiBadGatewayResponse({ description: 'The source or the browser behind the scraping service failed.' })
  @ApiServiceUnavailableResponse({ description: 'The scraping service did not answer, or did not answer in time.' })
  discover(@Body() input: DiscoverDto): Promise<LibraryItemDto> {
    return this.scraping.discover(input);
  }

  @Post(SCRAPING_JOBS_PATH)
  @ApiOperation({ summary: "Record a job over an item's chapters, and publish it now or at a set time" })
  @ApiCreatedResponse({ type: ScrapingJobDto, description: 'Persisted, and published or booked. A range that matched nothing is a `completed` record with `total: 0`.' })
  @ApiBadRequestResponse({ description: 'A manual item, a range that will not parse, or a `startAt` that has passed.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No item under that id, or no crawler under its `sourceName`.' })
  @ApiNotImplementedResponse({ description: 'A crawler item that is not a novel.' })
  createJob(@Body() input: CreateScrapingJobDto): Promise<ScrapingJobDto> {
    return this.jobs.create(input);
  }

  @Get(SCRAPING_JOBS_PATH)
  @ApiOperation({ summary: 'One page of the job records — a tab of the Scrapings screen' })
  @ApiOkResponse({ type: ScrapingJobPageDto, description: 'Newest first, each with the tasks it described.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  listJobs(@Query() query: QueryListScrapingJobsDto): Promise<ScrapingJobPageDto> {
    return this.jobs.list(query);
  }

  @Patch(`${SCRAPING_JOBS_PATH}/:id/status`)
  // A PATCH rather than a PUT of the whole job: status is the one field a client may
  // move, and the other thirteen are the server's.
  @ApiOperation({ summary: 'Start, pause, resume or cancel a job' })
  @ApiOkResponse({ type: ScrapingJobDto, description: 'Written, published where the new status is `queued`, and mirrored.' })
  @ApiBadRequestResponse({ description: 'A status this job cannot reach from where it stands — including anything at all asked of a settled job.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No job under that id.' })
  updateJobStatus(@Param('id') id: string, @Body() input: UpdateScrapingJobStatusDto): Promise<ScrapingJobDto> {
    return this.jobs.setStatus(id, input.status);
  }

  @Delete(`${SCRAPING_JOBS_PATH}/:id`)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a settled job' })
  @ApiNoContentResponse({ description: 'Deleted, and every task filed under it with it.' })
  @ApiBadRequestResponse({ description: 'A job that has not settled — cancel it first, then delete it.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No job under that id.' })
  deleteJob(@Param('id') id: string): Promise<void> {
    return this.jobs.remove(id);
  }
}
