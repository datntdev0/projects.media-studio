import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Firebase's own floor is six characters; eight is ours. */
const MIN_LENGTH = 8;

export class ChangePasswordDto {
  @ApiProperty({ description: 'The password in use, as proof it is the owner asking and not a stolen token.', example: 'password' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: MIN_LENGTH, example: 'a-longer-password' })
  @IsString()
  @MinLength(MIN_LENGTH)
  newPassword!: string;
}
