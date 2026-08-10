import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LibraryItemType, LibrarySourceMode, NovelStatus } from '../entities/library-item.entity';

const MAX_TITLE = 300;

const MAX_SOURCE_NAME = 100;

const MAX_URL = 2048;

const MAX_AUTHOR = 200;

const MAX_LANGUAGE = 32;

const MAX_GENRE = 40;

const MAX_GENRES = 20;

const MAX_DESCRIPTION = 4000;

/**
 * The writable half of `metadata`: a novel's descriptive block, and nothing else.
 * Every counter is server-owned, so none of them appears here — a client that
 * could set `412 / 640` would be claiming content that does not exist.
 *
 * One shape rather than a body per type, which keeps the request surface at one
 * shape; the rule that an image or video item has nothing writable here lives in
 * the manager, with the other rules about meaning.
 */
export class LibraryItemMetadataDto {
  @ApiPropertyOptional({ description: "The work's own status, not the item's pipeline status.", enum: NovelStatus, enumName: 'NovelStatus' })
  @IsOptional()
  @IsEnum(NovelStatus)
  status?: NovelStatus;

  @ApiPropertyOptional({ maxLength: MAX_AUTHOR, example: 'Nguyen Van A' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_AUTHOR)
  author?: string;

  @ApiPropertyOptional({ maxLength: MAX_LANGUAGE, example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LANGUAGE)
  language?: string;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_GENRES, example: ['fantasy', 'adventure'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GENRES)
  @IsString({ each: true })
  @MaxLength(MAX_GENRE, { each: true })
  genres?: string[];

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string;
}

/**
 * A new item, as far as a client gets to decide it.
 *
 * Absent on purpose: `status`, which starts at `draft`, and every counter, which
 * belongs to the job runner. Both would be a client describing work nothing has
 * done.
 */
export class CreateLibraryItemDto {
  @ApiProperty({ description: 'Immutable after creation — it decides the shape of `metadata`.', enum: LibraryItemType, enumName: 'LibraryItemType' })
  @IsEnum(LibraryItemType)
  type!: LibraryItemType;

  @ApiProperty({ maxLength: MAX_TITLE, example: 'The Silent Cartographer' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_URL, description: 'A link to a cover image. Null, or left out, for the placeholder.' })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL)
  coverUrl?: string | null;

  @ApiProperty({ description: 'Immutable after creation — it decides how content arrives.', enum: LibrarySourceMode, enumName: 'LibrarySourceMode' })
  @IsEnum(LibrarySourceMode)
  sourceMode!: LibrarySourceMode;

  @ApiPropertyOptional({ maxLength: MAX_SOURCE_NAME, description: 'Which crawler, for a crawler item — required of one. A manual item is `Manual`, whatever is sent.', example: 'novelbin.crawler' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SOURCE_NAME)
  sourceName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_URL, description: 'What the crawler reads. Required of a crawler item, and refused of a manual one.', example: 'https://novelbin.net/n/silent-cartographer' })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ type: LibraryItemMetadataDto, description: 'A novel item only. An image or video item has nothing writable here.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LibraryItemMetadataDto)
  metadata?: LibraryItemMetadataDto;
}
