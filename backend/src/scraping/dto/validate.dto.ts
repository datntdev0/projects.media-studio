import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

const MAX_CRAWLER_NAME = 100;

const MAX_URL = 2048;

/**
 * What to read, and with what. Two fields, because that is the whole question —
 * everything else about the answer follows from the crawler's own entry.
 */
export class ValidateDto {
  @ApiProperty({ maxLength: MAX_CRAWLER_NAME, description: 'One of the registered crawlers. A name that is not registered is a 404.', example: 'novel543' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CRAWLER_NAME)
  crawler!: string;

  @ApiProperty({ maxLength: MAX_URL, description: "The book's URL on the source site. A URL on another site is a 400.", example: 'https://www.novel543.com/0413553971' })
  @IsUrl()
  @MaxLength(MAX_URL)
  sourceUrl!: string;
}

/**
 * `?refresh=true` — read the source again rather than answer from the cache.
 *
 * `@Transform` rather than `@Type(() => Boolean)`: `Boolean('false')` is `true`, so
 * casting would make every value mean yes. The same trap `configuration.ts` notes.
 */
export class QueryValidateDto {
  @ApiPropertyOptional({ description: 'Skip the cached answer and read the source again.', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  refresh: boolean = false;
}
