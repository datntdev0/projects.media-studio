import { ApiProperty } from '@nestjs/swagger';

/** A Firebase account as the API returns it. */
export class UserDto {
  @ApiProperty({ description: 'The Firebase uid.', example: 'ibYD2mzCTz7DeQ5SqcR5Q7U4ySQv' })
  id!: string;

  @ApiProperty({ example: 'dat@media.studio' })
  email!: string;

  @ApiProperty({ description: "The account's display name, empty if it has none.", example: 'Dat Nguyen' })
  name!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true, example: null })
  photoUrl!: string | null;

  @ApiProperty({ description: 'UTC, as Firebase reports it.', example: 'Sun, 10 Aug 2026 02:28:31 GMT' })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Null until the account has signed in once.', example: 'Sun, 10 Aug 2026 03:14:02 GMT' })
  lastSignInAt!: string | null;
}
