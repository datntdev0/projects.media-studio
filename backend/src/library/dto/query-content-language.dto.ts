import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { TranslationLanguage } from '../entities/library-translation.entity';

/**
 * Which language a content route reads or writes. Left out means the source, which
 * is what every route did before translations existed.
 *
 * An enum rather than a string, and that is load-bearing: the value picks a
 * subcollection, so a route that took free text would let a request name one.
 */
export class QueryContentLanguageDto {
  @ApiPropertyOptional({ description: 'A novel only. Reads the translation, falling back to the source chapter where there is none.', enum: TranslationLanguage, enumName: 'TranslationLanguage' })
  @IsOptional()
  @IsEnum(TranslationLanguage)
  language?: TranslationLanguage;
}
