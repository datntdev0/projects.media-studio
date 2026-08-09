import { ApiProperty } from '@nestjs/swagger';

/** A user as the API returns it — never with the credential. */
export class UserDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000001' })
  id!: string;

  @ApiProperty({ example: 'dat@media.studio' })
  email!: string;

  @ApiProperty({ example: 'Dat Nguyen' })
  name!: string;
}

/** What a successful login or registration hands back. */
export class SessionDto {
  @ApiProperty({
    description: 'MOCK token. Not a JWT, not signed, not to be trusted.',
    example: 'mock.00000000-0000-4000-8000-000000000001',
  })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: string;

  @ApiProperty({
    description: 'Seconds until the token expires.',
    example: 3600,
  })
  expiresIn!: number;

  @ApiProperty({ type: UserDto })
  user!: UserDto;
}
