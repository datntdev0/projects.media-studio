import { ApiProperty } from '@nestjs/swagger';
import { ContentLanguages } from '../entities/library-content.entity';

/**
 * What an export produced.
 *
 * The bytes are not here and never will be: the archive is an object in the bucket
 * like every other file this API deals in, and what travels over HTTP is the URL to
 * read it back with. The object carries its own `Content-Disposition`, so a client
 * opens the URL and the browser saves it under `filename`.
 */
export class LibraryPackageDto {
  @ApiProperty({ description: 'Where the archive is. Tokenised, and ready to open.' })
  url!: string;

  @ApiProperty({ description: 'What the browser saves it as.', example: 'the-silent-cartographer-export.zip' })
  filename!: string;

  @ApiProperty({ description: 'What the archive weighs.', example: 4_182_004 })
  bytes!: number;

  @ApiProperty({ description: 'Text rows written — original chapters and translations together.', example: 640 })
  contents!: number;

  @ApiProperty({ description: 'Of those, how many had text to pack. The rest are discovered chapters nobody has scraped.', example: 412 })
  bodies!: number;

  @ApiProperty({ description: 'Translated rows per language, zeroes included.', example: { vi: 128, en: 0, zh: 0 } })
  translations!: Record<ContentLanguages, number>;
}
