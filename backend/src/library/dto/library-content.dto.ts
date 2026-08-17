import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { ImageAsset, LibraryContent, LibraryContentBase, LibraryContentStatus, NovelChapter, VideoAsset } from '../entities/library-content.entity';
import { LibraryItemType } from '../entities/library-item.entity';

/**
 * One piece of content, and the three shapes it can take — one file, because the
 * shapes exist only to say what a row of a given type returns.
 *
 * Unlike `LibraryItemDto`, the union is at the root rather than under one field,
 * so there is no single class to hang it on: the three below are what responses
 * are documented as, `oneOf`. Each `implements` its entity, so a field added to
 * one and forgotten here is a compile error.
 */

/** What every row carries whatever its type. */
export class LibraryContentBaseDto implements LibraryContentBase {
  @ApiProperty({ example: 'kQ2mR8vXpL4nTb7wYc1E' })
  id!: string;

  @ApiProperty({ description: "The item's own type. Set from the parent, never sent.", enum: LibraryItemType, enumName: 'LibraryItemType' })
  type!: LibraryItemType;

  @ApiProperty({ type: String, nullable: true, description: 'Where the piece came from. Null for a row added by hand.', example: null })
  sourceUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Where the bytes are. Null while the row is a placeholder.', example: null })
  contentUrl!: string | null;

  @ApiProperty({ description: 'A life cycle. `pending` and `completed` follow from `contentUrl`; the other three are discovery\'s and the job runner\'s.', enum: LibraryContentStatus, enumName: 'LibraryContentStatus' })
  status!: LibraryContentStatus;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-11T09:12:04.113Z' })
  updatedAt!: string;

  // Neither of the two below is stored, which is why this class carries more than
  // the interface it implements — `implements` asks for at least the members, not
  // exactly them. Both are worked out per read, from a source row the route has in
  // hand anyway.
  @ApiProperty({ description: 'Whether this row is a translation. False for the source, and false for a chapter no one has translated into the language asked for.', example: false })
  translated!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'What the chapter is called in its own language, for the line under a translated title. Null when this row is the source.', example: null })
  sourceTitle!: string | null;
}

/**
 * One chapter of a novel.
 *
 * Each of the three below pins `type` to its own value, and each needs its own
 * `enumName`: a subclass's `@ApiProperty` is merged with the base's, so an
 * override that says nothing about the name inherits `LibraryItemType` and
 * republishes that shared schema as the single value it pinned.
 */
export class NovelChapterDto extends LibraryContentBaseDto implements NovelChapter {
  @ApiProperty({ enum: [LibraryItemType.Novel], enumName: 'NovelChapterType' })
  declare type: LibraryItemType.Novel;

  @ApiProperty({ description: 'The chapter number, and what the list is ordered by.', example: 412 })
  index!: number;

  @ApiProperty({ example: 'Nine Bells for the Harbour' })
  title!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ description: 'How long the stored text runs. Zero until there is text.', example: 2744 })
  words!: number;
}

/** One image of a set. */
export class ImageAssetDto extends LibraryContentBaseDto implements ImageAsset {
  @ApiProperty({ enum: [LibraryItemType.Image], enumName: 'ImageAssetType' })
  declare type: LibraryItemType.Image;

  @ApiProperty({ example: 'img_001.jpg' })
  filename!: string;

  @ApiProperty({ description: 'Bytes.', example: 2088960 })
  filesize!: number;
}

/** One clip of a set. */
export class VideoAssetDto extends LibraryContentBaseDto implements VideoAsset {
  @ApiProperty({ enum: [LibraryItemType.Video], enumName: 'VideoAssetType' })
  declare type: LibraryItemType.Video;

  @ApiProperty({ example: 'clip_001.mp4' })
  filename!: string;

  @ApiProperty({ description: 'Bytes.', example: 74883072 })
  filesize!: number;
}

/** What a response documents one row as: whichever of the three the item's type decides. */
export const CONTENT_ONE_OF = [{ $ref: getSchemaPath(NovelChapterDto) }, { $ref: getSchemaPath(ImageAssetDto) }, { $ref: getSchemaPath(VideoAssetDto) }];

/** One page of an item's content, and enough to draw the counts around it. */
@ApiExtraModels(NovelChapterDto, ImageAssetDto, VideoAssetDto)
export class LibraryContentPageDto {
  @ApiProperty({ type: 'array', items: { oneOf: CONTENT_ONE_OF }, description: 'Chapters by their number, assets by their name.' })
  items!: LibraryContent[];

  @ApiProperty({ description: 'What matches the filter, not what this page holds.', example: 640 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 50 })
  pageSize!: number;
}
