import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl } from 'class-validator';
import { ImportConflict, PackageCheckState } from '../entities/library-package.entity';
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

/** Which package. The bytes are already in the bucket; this is where. */
export class LibraryPackageRefDto {
  @ApiProperty({ description: 'The download URL of an uploaded package. It has to be an object in this bucket.' })
  @IsUrl()
  packageUrl!: string;
}

/** The same package, plus what to do about the chapters the target already holds. */
export class StartLibraryImportDto extends LibraryPackageRefDto {
  @ApiProperty({ description: 'What to do with a chapter number this item already has.', enum: ImportConflict, enumName: 'ImportConflict' })
  @IsEnum(ImportConflict)
  onConflict!: ImportConflict;
}

/** What a queued import answers with. Nothing is written yet. */
export class LibraryImportDto {
  @ApiProperty({ description: "Where the chapters are going. The route's id, unless the policy made a new item.", example: 'oWY5aMSyk2Xu6nqQKtF3' })
  itemId!: string;

  @ApiProperty({ description: 'Bodies to write — chapters plus translations. What the progress bar divides by.', example: 1052 })
  total!: number;
}

/** One line of the report — the mockup's badge, its bold line and its muted one. */
export class LibraryPackageCheckDto {
  @ApiProperty({ enum: PackageCheckState, enumName: 'PackageCheckState' })
  state!: PackageCheckState;

  @ApiProperty({ example: '640 chapter files' })
  label!: string;

  @ApiProperty({ example: '228 new · 412 matched, for the conflict policy to decide' })
  detail!: string;
}

/**
 * What is in a package, read without writing a thing.
 *
 * The numbers are here as well as in the checks because the dialog counts with them
 * — "Import 228 chapters" is a button label, not a sentence to parse back out of a
 * check's `detail`.
 */
export class LibraryPackageReportDto {
  @ApiProperty({ description: 'Whether an import may proceed: no check failed. A warning does not stop one.' })
  valid!: boolean;

  @ApiProperty({ type: [LibraryPackageCheckDto] })
  checks!: LibraryPackageCheckDto[];

  @ApiProperty({ description: 'Chapter records in the package.', example: 640 })
  chapters!: number;

  @ApiProperty({ description: 'Chapter numbers the target does not hold yet.', example: 228 })
  adding!: number;

  @ApiProperty({ description: 'Chapter numbers it already holds. What the conflict policy decides about.', example: 412 })
  existing!: number;

  @ApiProperty({ type: [String], description: 'Entries the format does not know, left alone.', example: ['notes.pdf'] })
  skipped!: string[];

  @ApiProperty({ type: [LibraryTranslationCoverageDto], description: 'One row per language the package carries. A language it does not is absent, not zero.' })
  translations!: LibraryTranslationCoverageDto[];
}
