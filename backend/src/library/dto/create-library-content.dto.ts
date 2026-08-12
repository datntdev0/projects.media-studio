import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from 'class-validator';

const MAX_TITLE = 300;

const MAX_FILENAME = 300;

const MAX_LANGUAGE = 32;

const MAX_URL = 2048;

/** Chapter numbering runs high in serialised fiction, but not this high. */
const MAX_INDEX = 1_000_000;

/**
 * A new piece of content, as far as a client gets to decide it.
 *
 * One shape for all three types, every field optional — part 1's precedent with
 * `LibraryItemMetadataDto`. Which fields a request must carry and which it must
 * leave out follows from the parent item's type, and that rule lives in the
 * manager with the other rules about meaning.
 *
 * Absent on purpose: `type`, which is the parent's, and `status`, which follows
 * from `contentUrl`. Neither is a client's to decide.
 */
export class CreateLibraryContentDto {
  @ApiPropertyOptional({ minimum: 0, maximum: MAX_INDEX, description: 'A chapter only. Defaults to the next number up.', example: 412 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INDEX)
  index?: number;

  @ApiPropertyOptional({ maxLength: MAX_TITLE, description: 'A chapter only, and required of one.', example: 'Nine Bells for the Harbour' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TITLE)
  title?: string;

  @ApiPropertyOptional({ maxLength: MAX_LANGUAGE, description: 'A chapter only.', example: 'en' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LANGUAGE)
  language?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'A chapter only. Counted by whoever wrote the text — see the known limits.', example: 2744 })
  @IsOptional()
  @IsInt()
  @Min(0)
  words?: number;

  @ApiPropertyOptional({ maxLength: MAX_FILENAME, description: 'An image or video asset only, and required of one.', example: 'img_001.jpg' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_FILENAME)
  filename?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'An image or video asset only. Bytes, as the uploader reports them.', example: 2088960 })
  @IsOptional()
  @IsInt()
  @Min(0)
  filesize?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_URL, description: 'Where the browser put the bytes. Left out for a placeholder row.' })
  @IsOptional()
  @IsUrl()
  @MaxLength(MAX_URL)
  contentUrl?: string | null;
}
