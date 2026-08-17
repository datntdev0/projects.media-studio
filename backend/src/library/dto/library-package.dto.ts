import { ApiProperty } from '@nestjs/swagger';
import { LibraryTranslationCoverageDto } from './library-translation.dto';

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

  @ApiProperty({ description: 'Chapter records written.', example: 640 })
  chapters!: number;

  @ApiProperty({ description: 'Of those, how many had text to pack. The rest are discovered chapters nobody has scraped.', example: 412 })
  bodies!: number;

  // Part 4's row rather than a shape of its own: how many chapters a language covers
  // is the same fact whether it is read off an item or out of a package, and two
  // classes saying it is two classes that can disagree.
  @ApiProperty({ type: [LibraryTranslationCoverageDto], description: 'What the package carries per language — all three, zeroes included.' })
  translations!: LibraryTranslationCoverageDto[];
}
