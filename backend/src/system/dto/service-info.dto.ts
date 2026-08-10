import { ApiProperty } from '@nestjs/swagger';
import { NodeEnv } from '../../core/config/configuration';
import { SystemInfo } from '../entities/system-info.entity';

/**
 * What the stored record says this deployment is: the build that last started,
 * the environment it was configured for, the API version it serves, and when it
 * first and last started.
 *
 * `implements SystemInfo` so the two shapes cannot drift apart quietly — a field
 * added to the entity and forgotten here is a compile error.
 */
export class ServiceInfoDto implements SystemInfo {
  @ApiProperty({ example: '@media-studio/backend' })
  name!: string;

  @ApiProperty({
    description: 'Version from the package manifest.',
    example: '0.0.0',
  })
  version!: string;

  @ApiProperty({
    description: 'The environment that build was configured for, as recorded on boot.',
    enum: NodeEnv,
    enumName: 'NodeEnv',
  })
  environment!: NodeEnv;

  @ApiProperty({
    description: 'The version its versioned endpoints answer on when a client names none.',
    example: 'v1',
  })
  apiVersion!: string;

  @ApiProperty({
    description: 'The data shape this build expects to find in the database.',
    example: 1,
  })
  schemaVersion!: number;

  @ApiProperty({
    description: 'When this service first started against this database.',
    example: '2026-08-10T09:12:04.113Z',
  })
  installedAt!: string;

  @ApiProperty({
    description: 'When the process now serving started, as recorded on boot.',
    example: '2026-08-10T09:12:04.113Z',
  })
  lastStartedAt!: string;
}
