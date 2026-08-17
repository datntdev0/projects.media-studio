import { ApiProperty } from '@nestjs/swagger';
import { TranslationCoverage, TranslationLanguage } from '../entities/library-translation.entity';

/**
 * How much of a novel one language covers, as `LibraryItemDto.translations` lists
 * it — three rows, always all three, so a dropdown can say `none yet` without a
 * special case.
 *
 * No total. It is the item's own `metadata.discoveredCount`, four fields away in
 * the same response, and a number sent twice is a number that can disagree with
 * itself.
 */
export class LibraryTranslationCoverageDto implements TranslationCoverage {
  @ApiProperty({ enum: TranslationLanguage, enumName: 'TranslationLanguage' })
  language!: TranslationLanguage;

  @ApiProperty({ description: 'Chapters translated into it. Zero until one is written.', example: 412 })
  translated!: number;
}
