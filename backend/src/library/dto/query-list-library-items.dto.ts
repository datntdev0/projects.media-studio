import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode } from '../entities/library-item.entity';

const MAX_SEARCH = 200;

const DEFAULT_PAGE_SIZE = 20;

const MAX_PAGE_SIZE = 100;

/**
 * What narrows the listing. The three enums go to Firestore as equality filters;
 * `search` and the paging are applied after, over what comes back.
 *
 * `@Type(() => Number)` on the numbers because a query string arrives as text and
 * the global pipe transforms rather than guesses.
 */
export class QueryListLibraryItemsDto {
  @ApiPropertyOptional({ enum: LibraryItemType, enumName: 'LibraryItemType' })
  @IsOptional()
  @IsEnum(LibraryItemType)
  type?: LibraryItemType;

  @ApiPropertyOptional({ description: 'All four, including the two only the job runner sets — a filter reads data it does not write.', enum: LibraryItemStatus, enumName: 'LibraryItemStatus' })
  @IsOptional()
  @IsEnum(LibraryItemStatus)
  status?: LibraryItemStatus;

  @ApiPropertyOptional({ enum: LibrarySourceMode, enumName: 'LibrarySourceMode' })
  @IsOptional()
  @IsEnum(LibrarySourceMode)
  sourceMode?: LibrarySourceMode;

  @ApiPropertyOptional({ maxLength: MAX_SEARCH, description: "Case-insensitive, matched against the title, the source name and a novel's author." })
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
