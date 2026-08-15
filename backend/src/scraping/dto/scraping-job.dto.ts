import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { LibraryItemType } from '../../library/entities/library-item.entity';
import { ScrapingJob, ScrapingJobStatus, ScrapingTask } from '../entities/scraping-job.entity';

const MAX_ID = 128;

const MAX_RANGE = 1024;

const MAX_RETRIES = 3;

/**
 * A job to describe, not a job to address: which item, which chapters, what to do
 * with the ones already held, and when to start.
 */
export class CreateScrapingJobDto {
  @ApiProperty({ maxLength: MAX_ID, description: 'The crawler item to scrape. A manual item is a 400.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  libraryId!: string;

  @ApiProperty({
    maxLength: MAX_RANGE,
    description: '`all`, `missing`, or an index expression — `1,3,5,7`, `23-34`, `[23:34]`. Anything else is a 400.',
    example: 'missing',
  })
  @IsString()
  @MaxLength(MAX_RANGE)
  range!: string;

  @ApiPropertyOptional({ description: 'Whether a chapter that already holds text is fetched again.', default: false })
  @IsOptional()
  @IsBoolean()
  refetch: boolean = false;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'When to publish the work. Null queues it now.', example: '2026-08-14T03:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt: string | null = null;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_RETRIES, description: 'How many times a failed chapter is tried again. The dialog offers 3, 1 and 0.', default: MAX_RETRIES })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_RETRIES)
  retry: number = MAX_RETRIES;
}

/** One piece of content the job was asked to fetch, and where that ask has got to. */
export class ScrapingTaskDto implements ScrapingTask {
  @ApiProperty({ description: 'The library content row this task is for — and this task\'s own id.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ example: 'kQ2mR8vXpL4nTb7wYc1E' })
  contentId!: string;

  @ApiProperty({ description: 'Denormalised so a task reads on its own.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  libraryId!: string;

  @ApiProperty({ description: 'The chapter number — what the list is ordered by.', example: 413 })
  index!: number;

  @ApiProperty({ example: 'https://www.novel543.com/0413553971/8096_527.html' })
  sourceUrl!: string;

  @ApiProperty({ enum: ScrapingJobStatus, enumName: 'ScrapingJobStatus' })
  status!: ScrapingJobStatus;

  @ApiProperty({ description: "The job's, copied down: it is what the message carries." })
  refetch!: boolean;

  @ApiProperty({ description: "The job's, copied down, for the same reason.", example: 3 })
  retry!: number;

  @ApiProperty({ type: String, nullable: true, description: 'When a consumer picked this task up.', example: null })
  startAt!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  completedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'The last failure, in one line.', example: null })
  error!: string | null;
}

/**
 * The record: what was asked for, and where it has got to.
 *
 * `libraryTitle` and `libraryType` are the item as it was when the job was
 * described — a historical statement rather than a view of the library.
 */
export class ScrapingJobDto implements ScrapingJob {
  @ApiProperty({ example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ example: 'kQ2mR8vXpL4nTb7wYc1E' })
  libraryId!: string;

  @ApiProperty({ description: "The item's type, as it was. What the listing's library filter narrows on.", enum: LibraryItemType, enumName: 'LibraryItemType' })
  libraryType!: LibraryItemType;

  @ApiProperty({ description: 'As the item was called when the job was described.', example: 'The Silent Cartographer' })
  libraryTitle!: string;

  @ApiProperty({ description: "The item's `sourceName`, carried so a republish needs no read of it.", example: 'novel543' })
  crawler!: string;

  @ApiProperty({ enum: ScrapingJobStatus, enumName: 'ScrapingJobStatus' })
  status!: ScrapingJobStatus;

  @ApiProperty({ description: 'The expression as it was sent. Drawn verbatim in the panel.', example: '23-34' })
  range!: string;

  @ApiProperty()
  refetch!: boolean;

  @ApiProperty({ description: 'How many times a failed task is tried again.', example: 3 })
  retry!: number;

  @ApiProperty({ type: String, nullable: true, description: 'When the job is due. Null was queued immediately.', example: null })
  startAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'When its messages actually went out.', example: '2026-08-14T03:00:00.000Z' })
  queuedAt!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'When it settled, whichever way.', example: null })
  completedAt!: string | null;

  @ApiProperty({ description: 'Tasks in the job. What the progress bar divides by.', example: 640 })
  total!: number;

  @ApiProperty({ example: 412 })
  completed!: number;

  @ApiProperty({ example: 2 })
  failed!: number;

  @ApiProperty({ description: 'Candidates dropped as already complete.', example: 12 })
  skipped!: number;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  updatedAt!: string;

  @ApiProperty({ type: [ScrapingTaskDto], description: 'One per piece of content in range, by its number.' })
  tasks!: ScrapingTaskDto[];
}

/** BullMQ counts attempts, not retries. The one place the two are reconciled. */
export function attemptsFor(retry: number): number {
  return retry + 1;
}
