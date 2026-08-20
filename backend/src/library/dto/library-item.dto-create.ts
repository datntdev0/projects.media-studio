import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode } from '../entities/library-item.entity';
import { MAX_SOURCE_NAME, MAX_TITLE, MAX_URL } from './library-item.constants';
import { ImageSetMetadataDto, NovelMetadataDto, VideoSetMetadataDto } from './library-item.dto';

export class CreateLibraryItemDto {
  @ApiProperty({ description: 'Immutable after creation — it decides the shape of `metadata`.', enum: LibraryItemType })
  @IsEnum(LibraryItemType)
  type!: LibraryItemType;

  @ApiProperty({ description: 'The title of the library item.', example: 'The Silent Cartographer' })
  @IsString() @MinLength(1) @MaxLength(MAX_TITLE)
  title!: string;

  @ApiProperty({ description: 'The status of the library item.', enum: LibraryItemStatus })
  @IsEnum(LibraryItemStatus)
  status!: LibraryItemStatus;

  @ApiProperty({ description: 'Immutable after creation — it decides how content arrives.', enum: LibrarySourceMode })
  @IsEnum(LibrarySourceMode)
  sourceMode!: LibrarySourceMode;

  @ApiPropertyOptional({ description: 'Which crawler, for a crawler item — required of one. A manual item is `Manual`, whatever is sent.', example: 'novel543' })
  @IsOptional() @IsString() @MaxLength(MAX_SOURCE_NAME)
  sourceName?: string;

  @ApiPropertyOptional({ description: 'What the crawler reads. Required of a crawler item, and refused of a manual one.', example: 'https://www.novel543.com/0413553971' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ description: 'A link to a cover image. Null, or left out, for the placeholder.' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  coverUrl?: string | null;

  @ApiPropertyOptional({ description: 'The novel metadata of the library item, shape depends on the `type`.' })
  @IsOptional() @ValidateNested()
  novelMetadata?: NovelMetadataDto | null;

  @ApiPropertyOptional({ description: 'The image metadata of the library item, shape depends on the `type`.' })
  @IsOptional() @ValidateNested()
  imageMetadata?: ImageSetMetadataDto | null;

  @ApiPropertyOptional({ description: 'The video metadata of the library item, shape depends on the `type`.' })
  @IsOptional() @ValidateNested()
  videoMetadata?: VideoSetMetadataDto | null;
}
