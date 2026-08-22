import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LibraryItemType } from '../../library/entities/library-item.entity';
import { ScrapingJob, ScrapingJobStatus } from '../entities/scraping-job.entity';
import { Type } from 'class-transformer';
import { IsOptional, IsEnum, IsString, MaxLength, IsInt, Min, Max } from 'class-validator';
import { MAX_ID, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './scraping-job.constants';

export enum ScrapingJobState {
  Active = 'active',
  Scheduled = 'scheduled',
  History = 'history',
}

/** One piece of content the job was asked to fetch, and where that ask has got to. */
export class ScrapingTaskDto {
  @ApiProperty({ description: 'The library content row this task is for — and this task\'s own id.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ description: 'The library content row this task is for.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  contentId!: string;

  @ApiProperty({ description: 'Denormalised so a task reads on its own.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  libraryId!: string;

  @ApiProperty({ description: 'The chapter number — what the list is ordered by.', example: 413 })
  index!: number;

  @ApiProperty({ description: 'The URL where the content can be fetched from.', example: 'https://www.novel543.com/0413553971/8096_527.html' })
  sourceUrl!: string;

  @ApiProperty({ description: 'The task status.', enum: ScrapingJobStatus })
  status!: ScrapingJobStatus;

  @ApiProperty({ description: "The job's, copied down: it is what the message carries." })
  refetch!: boolean;

  @ApiProperty({ description: "The job's, copied down, for the same reason.", example: 3 })
  retry!: number;

  @ApiProperty({ description: 'When a consumer picked this task up.', example: null })
  startAt!: string | null;

  @ApiProperty({ description: 'When the task was completed.', example: null })
  completedAt!: string | null;

  @ApiProperty({ description: 'The last failure, in one line.', example: null })
  error!: string | null;

  @ApiProperty({ description: 'When the task was created.', example: '2026-08-11T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ description: 'When the task was last updated.', example: '2026-08-11T09:12:04.113Z' })
  updatedAt!: string;
}

/** The data transfer object for a scraping job. */
export class ScrapingJobDto implements ScrapingJob {
  @ApiProperty({ description: 'The unique identifier of the scraping job.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ description: 'The library this scraping job belongs to.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  libraryId!: string;

  @ApiProperty({ description: "The item's type, as it was. What the listing's library filter narrows on.", enum: LibraryItemType })
  libraryType!: LibraryItemType;

  @ApiProperty({ description: 'As the item was called when the job was described.', example: 'The Silent Cartographer' })
  libraryTitle!: string;

  @ApiProperty({ description: "The item's `sourceName`, carried so a republish needs no read of it.", example: 'novel543' })
  crawler!: string;

  @ApiProperty({ description: 'The task status.', enum: ScrapingJobStatus })
  status!: ScrapingJobStatus;

  @ApiProperty({ description: 'The expression as it was sent. Drawn verbatim in the panel.', example: '23-34' })
  range!: string;

  @ApiProperty({ description: 'Whether a chapter that already holds text is fetched again.', example: false })
  refetch!: boolean;

  @ApiProperty({ description: 'How many times a failed task is tried again.', example: 3 })
  retry!: number;

  @ApiProperty({ description: 'When the job is due. Null was queued immediately.', example: null })
  startAt!: string | null;

  @ApiProperty({ description: 'When its messages actually went out.', example: '2026-08-14T03:00:00.000Z' })
  queuedAt!: string | null;

  @ApiProperty({ description: 'When it settled, whichever way.', example: null })
  completedAt!: string | null;

  @ApiProperty({ description: 'Tasks in the job. What the progress bar divides by.', example: 640 })
  total!: number;

  @ApiProperty({ description: 'How many tasks have been completed.', example: 412 })
  completed!: number;

  @ApiProperty({ description: 'How many tasks have failed.', example: 2 })
  failed!: number;

  @ApiProperty({ description: 'Candidates dropped as already complete.', example: 12 })
  skipped!: number;

  @ApiProperty({ description: 'When the task was created.', example: '2026-08-11T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ description: 'When the task was last updated.', example: '2026-08-11T09:12:04.113Z' })
  updatedAt!: string;

  @ApiProperty({ type: [ScrapingTaskDto], description: 'One per piece of content in range, by its number.' })
  tasks!: ScrapingTaskDto[];
}

/** One page of the job records, matching `LibraryItemPageDto` field for field. */
export class ScrapingJobPageDto {
  @ApiProperty({ type: [ScrapingJobDto], description: 'Newest first, each with the tasks it described.' })
  items!: ScrapingJobDto[];

  @ApiProperty({ description: 'What matches the filter, not what this page holds.', example: 12 })
  total!: number;

  @ApiProperty({ description: 'The current page number.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'The number of items per page.', example: 20 })
  pageSize!: number;
}

/** Query parameters for listing scraping jobs. */
export class QueryListScrapingJobsDto {
  @ApiPropertyOptional({ description: 'One of the screen\'s three tabs. Omitted lists every job.', enum: ScrapingJobState })
  @IsOptional() @IsEnum(ScrapingJobState)
  state?: ScrapingJobState;

  @ApiPropertyOptional({ description: 'The type of the item scraped, as it was when the job was described.', enum: LibraryItemType })
  @IsOptional() @IsEnum(LibraryItemType)
  libraryType?: LibraryItemType;

  @ApiPropertyOptional({ maxLength: MAX_ID, description: 'Every job over one item — what an item screen asks for.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  @IsOptional() @IsString() @MaxLength(MAX_ID)
  libraryId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
