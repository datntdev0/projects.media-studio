import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { LibraryItemType, NovelStatus } from '../../library/entities/library-item.entity';

const MAX_URL = 2048;

/**
 * What to read, and with what. Two fields, because that is the whole question —
 * everything else about the answer follows from the crawler's own entry.
 */
export class PreviewRequestDto {
  @ApiProperty({ description: 'One of the registered crawlers. A name that is not registered is a 404.', example: 'novel543' })
  @IsString()
  @MinLength(1)
  crawler!: string;

  @ApiProperty({ description: "The book's URL on the source site. A URL on another site is a 400.", example: 'https://www.novel543.com/0413553971' })
  @IsUrl()
  @MaxLength(MAX_URL)
  sourceUrl!: string;

  @ApiPropertyOptional({ description: 'Skip the cached answer and read the source again.', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh: boolean = false;
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

  @ApiProperty({ description: "From the crawler's entry — the source does not publish one.", example: 'zh' })
  language!: string;

  @ApiProperty({ type: [String], description: 'The source category, where it has one.', example: ['武俠'] })
  genres!: string[];

  @ApiProperty({ example: 'A cartographer maps a coast that keeps moving.' })
  description!: string;

  @ApiProperty({ description: 'How many chapters the source has, or how many it says it has.', example: 1305 })
  chapters!: number;

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
  novelContent!: NovelPreviewDto;
}
