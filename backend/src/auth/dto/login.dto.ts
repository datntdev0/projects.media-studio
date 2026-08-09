import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * The global ValidationPipe checks this before the controller runs, and rejects
 * unknown properties rather than dropping them — a client's typo should fail
 * loudly, not silently.
 */
export class LoginDto {
  @ApiProperty({ example: 'dat@media.studio' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;
}
