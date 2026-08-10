import { ApiProperty } from '@nestjs/swagger';
import { NodeEnv } from '../../core/config/configuration';

/** What the service is: build, environment and the API version it defaults to. */
export class ServiceInfoDto {
  @ApiProperty({ example: '@media-studio/backend' })
  name!: string;

  @ApiProperty({
    description: 'Version from the package manifest.',
    example: '0.0.0',
  })
  version!: string;

  @ApiProperty({ enum: NodeEnv, enumName: 'NodeEnv' })
  environment!: NodeEnv;

  @ApiProperty({
    description: 'The version versioned endpoints answer on when a client names none.',
    example: 'v1',
  })
  apiVersion!: string;
}
