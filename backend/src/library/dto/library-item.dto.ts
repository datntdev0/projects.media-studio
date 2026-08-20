import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from '../entities/library-item.entity';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_SEARCH } from './library-content.constants';

/** The base metadata all library items share. */
export class LibraryItemMetadataBaseDto {
  @ApiProperty({ description: 'Pieces the source is known to have.', example: 640 })
  discoveredCount!: number;

  @ApiProperty({ description: 'How many of them are stored here.', example: 412 })
  downloadedCount!: number;

  @ApiProperty({ description: 'When the source was last read for that inventory.', example: null })
  discoveredAt!: string | null;
}

/** A novel: the counts, and what the source says about the work. */
export class NovelMetadataDto extends LibraryItemMetadataBaseDto {
  @ApiProperty({ description: "The work's own status, as its source publishes it.", enum: NovelStatus })
  status!: NovelStatus;

  @ApiProperty({ description: "The author's name.", example: 'Nguyen Van A' })
  author!: string;

  @ApiProperty({ description: "The language the work is written in.", example: 'en' })
  language!: string;

  @ApiProperty({ description: 'The genres the work belongs to.', example: ['fantasy', 'adventure'] })
  genres!: string[];

  @ApiProperty({ description: 'A brief summary of the work.', example: 'A cartographer maps a coast that keeps moving.' })
  description!: string;
}

/** An image set. */
export class ImageSetMetadataDto extends LibraryItemMetadataBaseDto {
  @ApiProperty({ description: 'Bytes held.', example: 882900275 })
  downloadedSize!: number;
}

/** A video set: bytes, and how long they run. */
export class VideoSetMetadataDto extends LibraryItemMetadataBaseDto {
  @ApiProperty({ description: 'Bytes held.', example: 3328599654 })
  downloadedSize!: number;

  @ApiProperty({ description: 'Seconds held.', example: 7412 })
  downloadedDuration!: number;
}

/** The whole item, as a client may send it. */
export class LibraryItemDto {
  @ApiProperty({ description: 'The unique identifier of the library item.', example: 'oWY5aMSyk2Xu6nqQKtF3' })
  id!: string;

  @ApiProperty({ description: 'Set on creation and immutable after it.', enum: LibraryItemType })
  type!: LibraryItemType;

  @ApiProperty({ description: 'The title of the library item.', example: 'The Silent Cartographer' })
  title!: string;

  @ApiProperty({ description: 'Where the item is in our pipeline.', enum: LibraryItemStatus })
  status!: LibraryItemStatus;

  @ApiProperty({ description: 'Set on creation and immutable after it.', enum: LibrarySourceMode, enumName: 'LibrarySourceMode' })
  sourceMode!: LibrarySourceMode;

  @ApiProperty({ description: "`Manual`, or the crawler's name.", example: 'novel543' })
  sourceName!: string;

  @ApiPropertyOptional({ description: 'What a crawler reads. Null for a manual item.', example: 'https://www.novel543.com/0413553971' })
  sourceUrl?: string | null;

  @ApiPropertyOptional({ description: 'A cover image URL, or null where the listing draws its placeholder.', example: null })
  coverUrl?: string | null;

  @ApiPropertyOptional({ description: 'Metadata specific to novels.', type: NovelMetadataDto,  })
  novelMetadata?: NovelMetadataDto | null;

  @ApiPropertyOptional({ description: 'Metadata specific to image sets.', type: ImageSetMetadataDto })
  imageMetadata?: ImageSetMetadataDto | null;

  @ApiPropertyOptional({ description: 'Metadata specific to video sets.', type: VideoSetMetadataDto })
  videoMetadata?: VideoSetMetadataDto | null;

  @ApiProperty({ description: 'Set on creation.', example: '2026-08-10T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Rewritten on every write. The listing is ordered by it.', example: '2026-08-10T09:12:04.113Z' })
  updatedAt!: string;
}

/** One page of the listing, and enough to draw the pager and the counts around it. */
export class LibraryItemPageDto {
  @ApiProperty({ type: [LibraryItemDto], description: 'This page, ordered by `updatedAt` descending.' })
  items!: LibraryItemDto[];

  @ApiProperty({ description: 'What matches the filter, not what this page holds.', example: 640 })
  total!: number;

  @ApiProperty({ description: 'The current page number.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'The number of items per page.', example: 50 })
  pageSize!: number;
}

/** Query parameters for listing library items. */
export class QueryListLibraryItemsDto {
  @ApiPropertyOptional({ description: 'The type of the library item.', enum: LibraryItemType })
  @IsOptional() @IsEnum(LibraryItemType)
  type?: LibraryItemType;

  @ApiPropertyOptional({ description: 'All four, including the two only the job runner sets — a filter reads data it does not write.', enum: LibraryItemStatus })
  @IsOptional() @IsEnum(LibraryItemStatus)
  status?: LibraryItemStatus;

  @ApiPropertyOptional({ description: 'The source mode of the library item.', enum: LibrarySourceMode })
  @IsOptional() @IsEnum(LibrarySourceMode)
  sourceMode?: LibrarySourceMode;

  @ApiPropertyOptional({ maxLength: MAX_SEARCH, description: "Case-insensitive, matched against the title, the source name and a novel's author." })
  @IsOptional() @IsString() @MaxLength(MAX_SEARCH)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional() @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
