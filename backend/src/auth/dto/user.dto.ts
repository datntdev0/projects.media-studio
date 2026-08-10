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
