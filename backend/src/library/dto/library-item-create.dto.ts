import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LibraryItemType, LibrarySourceMode } from '../entities/library-item.entity';
import { ImageSetMetadataInputDto, NovelMetadataInputDto, VideoSetMetadataInputDto } from './library-item.dto';
import type { LibraryItemMetadataInputDto } from './library-item.dto';
import { MAX_SOURCE_NAME, MAX_TITLE, MAX_URL } from './library-item.constants';

/**
 * A new item, as far as a client gets to decide it.
 *
 * Absent on purpose: `status`, which starts at `draft`, and every counter, which
 * belongs to the job runner. Both would be a client describing work nothing has
 * done.
 */
@ApiExtraModels(NovelMetadataInputDto, ImageSetMetadataInputDto, VideoSetMetadataInputDto)
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

  @ApiPropertyOptional({ maxLength: MAX_SOURCE_NAME, description: 'Which crawler, for a crawler item — required of one. A manual item is `Manual`, whatever is sent.', example: 'novel543' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SOURCE_NAME)
  sourceName?: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_URL, description: 'What the crawler reads. Required of a crawler item, and refused of a manual one.', example: 'https://www.novel543.com/0413553971' })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL)
  sourceUrl?: string | null;

  // Every shape is validated against the novel one, the widest of the three: a set
  // carrying a novel's field is refused by the manager, where the rest of the rules
  // about meaning live.
  @ApiPropertyOptional({
    description: 'The editable fields for this `type`. Every type may state the inventory; only a novel has anything else to say.',
    oneOf: [{ $ref: getSchemaPath(NovelMetadataInputDto) }, { $ref: getSchemaPath(ImageSetMetadataInputDto) }, { $ref: getSchemaPath(VideoSetMetadataInputDto) }],
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NovelMetadataInputDto)
  metadata?: LibraryItemMetadataInputDto;
}
