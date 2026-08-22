import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { ContentLanguages, LibraryContentStatus, LibraryContentType } from '../entities/library-content.entity';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_SEARCH, MAX_FILENAME, MAX_TITLE, MAX_URL } from './library-content.constants';

/** One chapter of a novel. */
export class TextContentDto {
  @ApiProperty({ description: 'The URL of the text content.', example: 'https://example.com/content.txt' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  contentUrl!: string | null;

  @ApiProperty({ description: 'The language of the text content.', enum: ContentLanguages, example: 'en' })
  @IsOptional() @IsEnum(ContentLanguages)
  language!: ContentLanguages;

  @ApiProperty({ description: 'The title of the text content.', example: 'Nine Bells for the Harbour' })
  @IsOptional() @IsString() @MaxLength(MAX_TITLE)
  title!: string;

  @ApiProperty({ description: 'How long the stored text runs. Zero until there is text.', example: 2744 })
  @IsOptional() @IsInt() @Min(0)
  words!: number;
}

/** One audio content item. */
export class AudioContentDto {
  @ApiProperty({ description: 'The URL of the audio content.', example: 'https://example.com/audio.mp3' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  contentUrl!: string | null;

  @ApiProperty({ description: 'The language of the audio content.', enum: ContentLanguages, example: 'en' })
  @IsOptional() @IsEnum(ContentLanguages)
  language!: ContentLanguages;

  @ApiProperty({ description: 'The URL of the subtitle content.', example: 'https://example.com/subtitles.srt' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  subtitleUrl!: string | null;
}

/** One image of a set. */
export class ImageContentDto {
  @ApiProperty({ description: 'The URL of the image content.', example: 'https://example.com/image.jpg' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  contentUrl!: string | null;

  @ApiProperty({ description: 'The filename of the image content.', example: 'img_001.jpg' })
  @IsOptional() @IsString() @MaxLength(MAX_FILENAME)
  filename!: string;

  @ApiProperty({ description: 'The size of the image content in bytes.', example: 2088960 })
  @IsOptional() @IsInt() @Min(0)
  filesize!: number;

  @ApiProperty({ description: 'The dimensions of the image content.', example: '1920x1080' })
  @IsOptional() @IsString()
  dimensions!: string;
}


/** One clip of a set. */
export class VideoContentDto {
  @ApiProperty({ description: 'The URL of the video content.', example: 'https://example.com/clip_001.mp4' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  contentUrl!: string | null;

  @ApiProperty({ description: 'The filename of the video content.', example: 'clip_001.mp4' })
  @IsOptional() @IsString() @MaxLength(MAX_FILENAME)
  filename!: string;

  @ApiProperty({ description: 'The size of the video content in bytes.', example: 74883072 })
  @IsOptional() @IsInt() @Min(0)
  filesize!: number;

  @ApiProperty({ description: 'The dimensions of the video content.', example: '1920x1080' })
  @IsOptional() @IsString()
  dimensions!: string;

  @ApiProperty({ description: 'The duration of the video content in seconds.', example: 412 })
  @IsOptional() @IsInt() @Min(0)
  duration!: number;
}

/** The complete library content item, including all possible media types. */
export class LibraryContentDto {
  @ApiProperty({ description: 'The unique identifier of the library content.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ description: 'The chapter number, and what the list is ordered by.', example: 412 })
  idx!: number;

  @ApiProperty({ description: "The item's own type. Set from the parent, never sent.", enum: LibraryContentType })
  type!: LibraryContentType;

  @ApiProperty({ description: 'A life cycle. `pending` and `completed` follow from `contentUrl`; the other three are discovery\'s and the job runner\'s.', enum: LibraryContentStatus })
  status!: LibraryContentStatus;

  @ApiProperty({ description: 'Where the piece came from. Null for a row added by hand.', example: null })
  sourceUrl!: string | null;

  @ApiPropertyOptional({ description: 'The text content of the library item.', type: TextContentDto })
  textContent!: TextContentDto | null;

  @ApiPropertyOptional({ description: 'The audio content of the library item.', type: AudioContentDto })
  audioContent!: AudioContentDto | null;

  @ApiPropertyOptional({ description: 'The image content of the library item.', type: ImageContentDto })
  imageContent!: ImageContentDto | null;

  @ApiPropertyOptional({ description: 'The video content of the library item.', type: VideoContentDto })
  videoContent!: VideoContentDto | null;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  updatedAt!: string;
}

/** One page of library content items. */
export class LibraryContentPageDto {
  @ApiProperty({ type: [LibraryContentDto], description: 'Chapters by their number, assets by their name.' })
  items!: LibraryContentDto[];

  @ApiProperty({ description: 'What matches the filter, not what this page holds.', example: 640 })
  total!: number;

  @ApiProperty({ description: 'The current page number.', example: 1 })
  page!: number;

  @ApiProperty({ description: 'The number of items per page.', example: 50 })
  pageSize!: number;
}

/** Query parameters for listing an item's content. */
export class QueryListLibraryContentsDto {
  @ApiPropertyOptional({ description: 'All five, including the ones only discovery and the job runner set — a filter reads data it does not write.', enum: LibraryContentStatus })
  @IsOptional() @IsEnum(LibraryContentStatus)
  status?: LibraryContentStatus;

  @ApiPropertyOptional({ description: 'The language of a chapter. Null for an asset.', enum: ContentLanguages })
  @IsOptional() @IsEnum(ContentLanguages)
  language?: ContentLanguages;

  @ApiPropertyOptional({ description: 'The type of content.', enum: LibraryContentType })
  @IsOptional() @IsEnum(LibraryContentType)
  type?: LibraryContentType;

  @ApiPropertyOptional({ description: "Case-insensitive, matched against a chapter's title or an asset's filename." })
  @IsOptional() @IsString() @MaxLength(MAX_SEARCH)
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
