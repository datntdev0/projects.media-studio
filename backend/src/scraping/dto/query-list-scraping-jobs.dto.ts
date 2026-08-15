import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LibraryItemType } from '../../library/entities/library-item.entity';

const MAX_ID = 128;

const DEFAULT_PAGE_SIZE = 20;

const MAX_PAGE_SIZE = 100;

/**
 * The screen's three tabs, each a group of statuses rather than one.
 *
 * A word of its own rather than a `status` filter: *active* is three statuses and
 * *history* is another three, and a client should ask for the tab it draws instead
 * of restating which states belong to it.
 */
export enum ScrapingJobState {
  Active = 'active',
  Scheduled = 'scheduled',
  History = 'history',
}

/**
 * What narrows the listing. `state` and `libraryType` go to Firestore as filters;
 * the ordering and the paging are applied after, over what comes back.
 *
 * `@Type(() => Number)` on the numbers because a query string arrives as text and
 * the global pipe transforms rather than guesses.
 */
export class QueryListScrapingJobsDto {
  @ApiPropertyOptional({ description: 'One of the screen\'s three tabs. Omitted lists every job.', enum: ScrapingJobState, enumName: 'ScrapingJobState' })
  @IsOptional()
  @IsEnum(ScrapingJobState)
  state?: ScrapingJobState;

  @ApiPropertyOptional({ description: 'The type of the item scraped, as it was when the job was described.', enum: LibraryItemType, enumName: 'LibraryItemType' })
  @IsOptional()
  @IsEnum(LibraryItemType)
  libraryType?: LibraryItemType;

  @ApiPropertyOptional({ maxLength: MAX_ID, description: 'Every job over one item — what an item screen asks for.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ID)
  libraryId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
