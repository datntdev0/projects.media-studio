import { ApiProperty } from '@nestjs/swagger';
import { LibraryItemType, NovelStatus } from '../../library/entities/library-item.entity';

/**
 * What the source says about a book, before anything is created.
 *
 * One shape doing three jobs: it is what the endpoint answers with, what the cache
 * stores, and what the review screen renders. That is what makes a cached answer a
 * parse rather than a re-derivation — and why the mapping out of the source's
 * vocabulary happens before any of the three.
 */

/** One chapter, as the source lists it. */
export class PreviewChapterDto {
  @ApiProperty({ description: 'Reading order, from 1.', example: 1 })
  index!: number;

  @ApiProperty({ example: '第1章：雨中少女' })
  title!: string;

  @ApiProperty({ example: 'https://www.novel543.com/0413553971/8095_1.html' })
  url!: string;
}

/** The novel as we describe it, rather than as the source spells it. */
export class NovelPreviewMetadataDto {
  @ApiProperty({ description: 'The canonical book URL, so two spellings of one book normalise to one.', example: 'https://www.novel543.com/0413553971' })
  sourceUrl!: string;

  @ApiProperty({ example: '我只是一個凡人，為什麼你們都奉我為聖' })
  title!: string;

  @ApiProperty({ example: '金屬寒霜' })
  author!: string;

  @ApiProperty({ description: "The work's own status, mapped from the source's word for it.", enum: NovelStatus, enumName: 'NovelStatus' })
  status!: NovelStatus;

  @ApiProperty({ description: "From the crawler's entry — the source does not publish one.", example: 'zh-Hant' })
  language!: string;

  @ApiProperty({ type: [String], description: 'The source category, where it has one.', example: ['武俠'] })
  genres!: string[];

  @ApiProperty({ example: 'A cartographer maps a coast that keeps moving.' })
  description!: string;

  @ApiProperty({ description: 'The newest chapter, as the source names it.', example: '第1305章：力量的誘惑' })
  latest!: string;

  @ApiProperty({ example: 'https://www.novel543.com/0413553971/1305.html' })
  latestUrl!: string;

  @ApiProperty({ description: "When the source last changed, in the source's own format. Not an ISO instant, and not compared to one.", example: '2026-08-13 00:33:11' })
  updatedAt!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Where the cover lives on the source. Behind the same protection as the site, so not for an `<img>` — use `coverBinary`.', example: 'https://i2.novel543.com/thumb_qm/120x160/20231221/211245397160.jpg' })
  coverUrl!: string | null;
}

/** What a novel source holds. */
export class NovelPreviewDto {
  @ApiProperty({ type: NovelPreviewMetadataDto })
  metadata!: NovelPreviewMetadataDto;

  @ApiProperty({ type: [PreviewChapterDto], description: 'Every chapter, in reading order. The preview draws a count from it; the job runner will draw content.' })
  chapters!: PreviewChapterDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The cover as a data URI — the bytes and their type in one string. Null where the book has no cover, or fetching it failed.',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRg…',
  })
  coverBinary!: string | null;
}

/**
 * The preview, whatever kind of source it came from.
 *
 * An envelope rather than a flat object: a crawler that reads image sets adds a
 * `content` shape instead of reshaping the response, and `type` is what says which
 * shape it is — the same discrimination `LibraryItemDto` makes on an item's `type`.
 * `content` is typed as the one shape there is; a second makes it a `oneOf`.
 */
export class PreviewDto {
  @ApiProperty({ description: "The crawler's kind, which decides the shape of `content`.", enum: LibraryItemType, enumName: 'LibraryItemType' })
  type!: LibraryItemType;

  @ApiProperty({ type: NovelPreviewDto })
  content!: NovelPreviewDto;
}
