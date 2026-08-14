import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

const MAX_ID = 128;

/**
 * Which item to read the source of. One field, because everything else — the
 * crawler, the URL, the type — is already on the item.
 */
export class DiscoverDto {
  @ApiProperty({ maxLength: MAX_ID, description: 'The crawler item to read the source of. A manual item is a 400.', example: 'kQ2mR8vXpL4nTb7wYc1E' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_ID)
  libraryId!: string;
}
