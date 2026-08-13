import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ImageSetMetadata, LibraryItemMetadataBase, NovelMetadata, VideoSetMetadata } from '../entities/library-item-metadata.entity';
import type { LibraryItemMetadata } from '../entities/library-item-metadata.entity';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from '../entities/library-item.entity';

/**
 * One item, and the three shapes its `metadata` can take — one file, because a
 * metadata DTO exists only to describe part of an item and is never returned on
 * its own.
 *
 * Each `implements` its entity, so a field added to one and forgotten here is a
 * compile error.
 */

/** The counts every type carries. Server-owned: nothing here is writable in part 1. */
export class LibraryItemMetadataBaseDto implements LibraryItemMetadataBase {
  @ApiProperty({ description: 'Pieces the source is known to have.', example: 640 })
  discoveredCount!: number;

  @ApiProperty({ type: String, nullable: true, description: 'When the source was last read for that inventory.', example: null })
  discoveredAt!: string | null;

  @ApiProperty({ description: 'How many of them are stored here.', example: 412 })
  downloadedCount!: number;
}

/** A novel: the counts, and what the source says about the work. */
export class NovelMetadataDto extends LibraryItemMetadataBaseDto implements NovelMetadata {
  @ApiProperty({ description: "The work's own status, as its source publishes it.", enum: NovelStatus, enumName: 'NovelStatus' })
  status!: NovelStatus;

  @ApiProperty({ example: 'Nguyen Van A' })
  author!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ type: [String], example: ['fantasy', 'adventure'] })
  genres!: string[];

  @ApiProperty({ example: 'A cartographer maps a coast that keeps moving.' })
  description!: string;
}

/** An image set. */
export class ImageSetMetadataDto extends LibraryItemMetadataBaseDto implements ImageSetMetadata {
  @ApiProperty({ description: 'Bytes held.', example: 882900275 })
  downloadedSize!: number;
}

/** A video set: bytes, and how long they run. */
export class VideoSetMetadataDto extends LibraryItemMetadataBaseDto implements VideoSetMetadata {
  @ApiProperty({ description: 'Bytes held.', example: 3328599654 })
  downloadedSize!: number;

  @ApiProperty({ description: 'Seconds held.', example: 7412 })
  downloadedDuration!: number;
}

/**
 * One item, whole, as `GET /:id`, `POST` and `PUT` answer with it.
 *
 * Not `implements LibraryItem`: the entity is a union discriminated on `type`,
 * and a class is one shape. What keeps the two honest is `metadata`, documented
 * as `oneOf` the three DTOs above, each of which does implement its entity.
 */
@ApiExtraModels(NovelMetadataDto, ImageSetMetadataDto, VideoSetMetadataDto)
export class LibraryItemDto {
  @ApiProperty({ example: 'oWY5aMSyk2Xu6nqQKtF3' })
  id!: string;

  @ApiProperty({ description: 'Set on creation and immutable after it.', enum: LibraryItemType, enumName: 'LibraryItemType' })
  type!: LibraryItemType;

  @ApiProperty({ example: 'The Silent Cartographer' })
  title!: string;

  @ApiProperty({ type: String, nullable: true, description: 'A cover image URL, or null where the listing draws its placeholder.', example: null })
  coverUrl!: string | null;

  @ApiProperty({ description: 'Set on creation and immutable after it.', enum: LibrarySourceMode, enumName: 'LibrarySourceMode' })
  sourceMode!: LibrarySourceMode;

  @ApiProperty({ description: "`Manual`, or the crawler's name.", example: 'novel543' })
  sourceName!: string;

  @ApiProperty({ type: String, nullable: true, description: 'What a crawler reads. Null for a manual item.', example: 'https://www.novel543.com/0413553971' })
  sourceUrl!: string | null;

  @ApiProperty({ description: 'Where the item is in our pipeline.', enum: LibraryItemStatus, enumName: 'LibraryItemStatus' })
  status!: LibraryItemStatus;

  @ApiProperty({
    description: 'Everything type-specific. Which shape it is follows from `type`: a novel returns NovelMetadataDto, an image ImageSetMetadataDto, a video VideoSetMetadataDto.',
    oneOf: [{ $ref: getSchemaPath(NovelMetadataDto) }, { $ref: getSchemaPath(ImageSetMetadataDto) }, { $ref: getSchemaPath(VideoSetMetadataDto) }],
  })
  metadata!: LibraryItemMetadata;

  @ApiProperty({ example: '2026-08-10T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Rewritten on every write. The listing is ordered by it.', example: '2026-08-10T09:12:04.113Z' })
  updatedAt!: string;
}
