import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode } from '../entities/library-item.entity';
import { ImageSetMetadataInputDto, NovelMetadataInputDto, VideoSetMetadataInputDto } from './library-item.dto';
import type { LibraryItemMetadataInputDto } from './library-item.dto';
import { MAX_SOURCE_NAME, MAX_TITLE, MAX_URL } from './library-item.constants';

/**
 * The statuses a person owns. `scraping` and `failed` are the job runner's, and
 * part 1 has no runner — a request for either is refused rather than honoured
 * into a state nothing can produce.
 */
export const WRITABLE_STATUSES = [LibraryItemStatus.Draft, LibraryItemStatus.Ready];


/**
 * The item's whole writable representation, which is why the route is a `PUT`:
 * **an omitted optional field is cleared**, not left alone. With `PATCH` an absent
 * key and an intentional erasure would look identical, and clearing an author or
 * a cover has to be expressible.
 *
 * Because it is a whole representation it may carry `type` and `sourceMode`, so a
 * client that reads, edits and writes back needs no special handling. Both are
 * immutable, so a value that differs from the stored one is a `400` rather than a
 * silent no-op.
 *
 * Every field is spelled out rather than composed from the creation body. The two
 * are the same shape today, but they are not the same request: this one describes
 * an item that already exists, and what each field means here says so.
 */
@ApiExtraModels(NovelMetadataInputDto, ImageSetMetadataInputDto, VideoSetMetadataInputDto)
export class UpdateLibraryItemDto {
  @ApiProperty({ description: 'Immutable — a value other than the stored one is refused.', enum: LibraryItemType, enumName: 'LibraryItemType' })
  @IsEnum(LibraryItemType)
  type!: LibraryItemType;

  @ApiProperty({ maxLength: MAX_TITLE, example: 'The Silent Cartographer' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_URL, description: 'A link to a cover image. Null, or left out, clears the one it has.' })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL)
  coverUrl?: string | null;

  @ApiProperty({ description: 'Immutable — a value other than the stored one is refused.', enum: LibrarySourceMode, enumName: 'LibrarySourceMode' })
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

  // The field a creation body has no room for: a new item is always a draft, so
  // there would be nothing to say. Here there is.
  @ApiPropertyOptional({ description: 'Defaults to `draft` when left out, like every other omitted field.', enum: WRITABLE_STATUSES, enumName: 'WritableLibraryItemStatus' })
  @IsOptional()
  @IsIn(WRITABLE_STATUSES)
  status?: LibraryItemStatus;

  // Validated against the novel shape whatever the type, the widest of the three:
  // a set carrying a novel's field is refused by the manager, where the rest of the
  // rules about meaning live.
  @ApiPropertyOptional({
    description: 'The editable fields for this `type`. Every type may state the inventory; only a novel has anything else to say.',
    oneOf: [{ $ref: getSchemaPath(NovelMetadataInputDto) }, { $ref: getSchemaPath(ImageSetMetadataInputDto) }, { $ref: getSchemaPath(VideoSetMetadataInputDto) }],
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => NovelMetadataInputDto)
  metadata?: LibraryItemMetadataInputDto;
}
