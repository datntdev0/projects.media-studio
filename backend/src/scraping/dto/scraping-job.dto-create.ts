import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, MinLength, MaxLength, IsOptional, IsBoolean, IsDateString, IsInt, Min, Max } from "class-validator";
import { MAX_ID, MAX_RANGE, MAX_RETRIES } from "./scraping-job.constants";

export class CreateScrapingJobDto {
  @ApiProperty({ description: 'The crawler item to scrape. A manual item is a 400.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  @IsString() @MinLength(1) @MaxLength(MAX_ID)
  libraryId!: string;

  @ApiProperty({ description: '`all`, `missing`, or an index expression — `1,3,5,7`, `23-34`, `[23:34]`. Anything else is a 400.', example: 'missing' })
  @IsString() @MaxLength(MAX_RANGE)
  range!: string;

  @ApiPropertyOptional({ description: 'Whether a chapter that already holds text is fetched again.', default: false })
  @IsOptional() @IsBoolean()
  refetch: boolean = false;

  @ApiPropertyOptional({ description: 'When to publish the work. Null queues it now.', example: '2026-08-14T03:00:00.000Z' })
  @IsOptional() @IsDateString() 
  startAt: string | null = null;

  @ApiPropertyOptional({ description: 'How many times a failed chapter is tried again. The dialog offers 3, 1 and 0.', default: MAX_RETRIES })
  @IsOptional() @IsInt() @Min(0) @Max(MAX_RETRIES)
  retry: number = MAX_RETRIES;
}