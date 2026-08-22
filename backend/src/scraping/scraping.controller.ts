import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadGatewayResponse, ApiBadRequestResponse, ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiNotFoundResponse, ApiNotImplementedResponse, ApiOkResponse, ApiServiceUnavailableResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { DiscoverDto } from './dto/discover.dto';
import { PreviewDto, PreviewRequestDto } from './dto/preview.dto';
import { CreateScrapingJobDto } from './dto/scraping-job.dto-create';
import { UpdateScrapingJobStatusDto } from './dto/scraping-job.dto-update';
import { QueryListScrapingJobsDto, ScrapingJobDto, ScrapingJobPageDto } from './dto/scraping-job.dto';
import { ScrapingManager } from './scraping.manager';

/**
 * `/api/v1/scrapings/…` — reading a source before anything is created from it.
 *
 * HTTP and nothing else. Which crawler exists, what a source says and what is
 * worth caching are the manager's; this file knows status codes and DTOs.
 */
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller("scrapings")
export class ScrapingController {
  constructor(private readonly scrapingManager: ScrapingManager) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: PreviewDto })
  @ApiBadRequestResponse({ description: "A URL that is not on the crawler's own site." })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No crawler under that name, or no book at that URL.' })
  @ApiBadGatewayResponse({ description: 'The source or the browser behind the scraping service failed.' })
  @ApiServiceUnavailableResponse({ description: 'The scraping service did not answer, or did not answer in time.' })
  preview(@Body() input: PreviewRequestDto): Promise<PreviewDto> {
    return this.scrapingManager.preview(input);
  }

  @Post('discover')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Read, compared, appended. The counters are as they now stand.' })
  @ApiBadRequestResponse({ description: "A manual item — it has no source to read — or a `sourceUrl` that is not on the crawler's own site." })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No item under that id, no crawler under its `sourceName`, or no book at its URL.' })
  @ApiNotImplementedResponse({ description: 'A crawler item that is not a novel.' })
  @ApiBadGatewayResponse({ description: 'The source or the browser behind the scraping service failed.' })
  @ApiServiceUnavailableResponse({ description: 'The scraping service did not answer, or did not answer in time.' })
  discover(@Body() input: DiscoverDto): Promise<void> {
    return this.scrapingManager.discover(input);
  }

  @Get("scraping/jobs")
  @ApiOkResponse({ type: ScrapingJobPageDto, description: 'Newest first, each with the tasks it described.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  listJobs(@Query() query: QueryListScrapingJobsDto): Promise<ScrapingJobPageDto> {
    return this.scrapingManager.list(query);
  }

  @Post("scraping/jobs")
  @ApiCreatedResponse({ type: ScrapingJobDto, description: 'Persisted, and published or booked. A range that matched nothing is a `completed` record with `total: 0`.' })
  @ApiBadRequestResponse({ description: 'A manual item, a range that will not parse, or a `startAt` that has passed.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No item under that id, or no crawler under its `sourceName`.' })
  @ApiNotImplementedResponse({ description: 'A crawler item that is not a novel.' })
  createJob(@Body() input: CreateScrapingJobDto): Promise<ScrapingJobDto> {
    return this.scrapingManager.create(input);
  }

  @Delete("scraping/jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted, and every task filed under it with it.' })
  @ApiBadRequestResponse({ description: 'A job that has not settled — cancel it first, then delete it.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No job under that id.' })
  deleteJob(@Param('id') id: string): Promise<void> {
    return this.scrapingManager.remove(id);
  }

  @Patch("scraping/jobs/:id/status")
  @ApiOkResponse({ type: ScrapingJobDto, description: 'Written, published where the new status is `queued`, and mirrored.' })
  @ApiBadRequestResponse({ description: 'A status this job cannot reach from where it stands — including anything at all asked of a settled job.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid ID token.' })
  @ApiNotFoundResponse({ description: 'No job under that id.' })
  updateJobStatus(@Param('id') id: string, @Body() input: UpdateScrapingJobStatusDto): Promise<ScrapingJobDto> {
    return this.scrapingManager.setStatus(id, input.status);
  }
}
