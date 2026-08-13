import { ApiExtraModels, ApiProperty, OmitType } from '@nestjs/swagger';
import { ImageSetMetadataDto, LibraryItemDto, NovelMetadataDto, VideoSetMetadataDto } from './library-item.dto';

/**
 * A row of the listing: the whole item bar `createdAt`, which neither the table
 * nor the grid draws — both show when it last changed.
 *
 * `OmitType` rather than a restatement, so every property keeps the description
 * and example it has on `LibraryItemDto` and the two cannot drift.
 */
@ApiExtraModels(NovelMetadataDto, ImageSetMetadataDto, VideoSetMetadataDto)
export class LibraryListItemDto extends OmitType(LibraryItemDto, ['createdAt'] as const) {}

/** One page of the listing, and enough to draw the pager and the counts around it. */
export class LibraryItemPageDto {
  @ApiProperty({ type: [LibraryListItemDto], description: 'This page, ordered by `updatedAt` descending.' })
  items!: LibraryListItemDto[];

  @ApiProperty({ description: 'How many items match the filter — not how many this page holds.', example: 8 })
  total!: number;

  @ApiProperty({ description: '1-based.', example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;
}
