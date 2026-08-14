import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const MAX_ID = 128;

const MAX_RANGE = 1024;

const MAX_RETRIES = 3;

/**
 * A job to describe, not a job to address: which item, which chapters, what to do
 * with the ones already held, and when to start.
 */
export class ScrapingJobDto {
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

/** What was published or booked, and when it runs. */
export class ScrapingJobStartedDto {
  @ApiProperty({ description: 'How many chapters were published, or booked to be. `0` where the range matched nothing.', example: 1305 })
  queued!: number;

  @ApiProperty({ description: 'Candidates dropped as already complete.', example: 12 })
  skipped!: number;

  @ApiProperty({ type: String, nullable: true, description: 'When the work runs. Null where it was published immediately.', example: '2026-08-14T03:00:00.000Z' })
  startAt!: string | null;
}

/** BullMQ counts attempts, not retries. The one place the two are reconciled. */
export function attemptsFor(retry: number): number {
  return retry + 1;
}
