import { ApiProperty } from '@nestjs/swagger';
import { NodeEnv } from '../../core/config/env.validation';

/** What the service is — the versioned API's entry point. */
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
    description: 'The API version serving this response.',
    example: 'v1',
  })
  apiVersion!: string;
}
