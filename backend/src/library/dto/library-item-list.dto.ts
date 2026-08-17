import { ApiExtraModels, ApiProperty, OmitType } from '@nestjs/swagger';
import { ImageSetMetadataDto, LibraryItemDto, NovelMetadataDto, VideoSetMetadataDto } from './library-item.dto';

/**
 * A row of the listing: the whole item bar `createdAt`, which neither the table
 * nor the grid draws — both show when it last changed, and bar `translations`,
 * which no listing row has a dropdown to draw.
 *
 * The second omission is a cost as much as a contract: coverage is three
 * aggregations per novel, and a page of twenty would be sixty of them for a
 * question this screen never asks. `LibraryManager.list` accordingly never
 * computes it.
 *
 * `OmitType` rather than a restatement, so every property keeps the description
 * and example it has on `LibraryItemDto` and the two cannot drift.
 */
@ApiExtraModels(NovelMetadataDto, ImageSetMetadataDto, VideoSetMetadataDto)
export class LibraryListItemDto extends OmitType(LibraryItemDto, ['createdAt', 'translations'] as const) {}

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
