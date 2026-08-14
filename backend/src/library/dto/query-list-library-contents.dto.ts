import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LibraryContentStatus } from '../entities/library-content.entity';

const MAX_SEARCH = 200;

const DEFAULT_PAGE_SIZE = 50;

const MAX_PAGE_SIZE = 200;

/**
 * What narrows an item's content. `status` goes to Firestore as an equality
 * filter; `search` and the paging are applied after, over what comes back.
 *
 * Larger pages than the listing's twenty: a chapter row is one line, and the
 * mockup scrolls them rather than paging through them.
 */
export class QueryListLibraryContentsDto {
  @ApiPropertyOptional({ description: 'All five, including the ones only discovery and the job runner set — a filter reads data it does not write.', enum: LibraryContentStatus, enumName: 'LibraryContentStatus' })
  @IsOptional()
  @IsEnum(LibraryContentStatus)
  status?: LibraryContentStatus;

  @ApiPropertyOptional({ maxLength: MAX_SEARCH, description: "Case-insensitive, matched against a chapter's title or an asset's filename." })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH)
  search?: string;

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
