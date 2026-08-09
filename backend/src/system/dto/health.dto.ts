import { ApiProperty } from '@nestjs/swagger';

export enum HealthStatus {
  Ok = 'ok',
}

/**
 * Liveness. Deliberately thin: it answers "is this process serving?" and
 * nothing else, so it stays cheap enough to poll every few seconds. Dependency
 * checks belong in a readiness endpoint, once there are dependencies to check.
 */
export class HealthDto {
  @ApiProperty({ enum: HealthStatus, enumName: 'HealthStatus' })
  status!: HealthStatus;

  @ApiProperty({
    description: 'Seconds since the process started.',
    example: 42,
  })
  uptimeSeconds!: number;
}
