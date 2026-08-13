import { Body, Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadGatewayResponse, ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { SCRAPING_PATH } from '../core/api.constants';
import { PreviewDto } from './dto/preview.dto';
import { QueryValidateDto, ValidateDto } from './dto/validate.dto';
import { ScrapingManager } from './scraping.manager';

/**
 * `/api/v1/scraping/…` — reading a source before anything is created from it.
 *
 * HTTP and nothing else. Which crawler exists, what a source says and what is
 * worth caching are the manager's; this file knows status codes and DTOs.
 */
@ApiTags('Scraping')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller(SCRAPING_PATH)
export class ScrapingController {
  constructor(private readonly scraping: ScrapingManager) {}

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
}
