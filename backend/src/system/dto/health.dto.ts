import { ApiProperty } from '@nestjs/swagger';

export enum HealthStatus {
  Ok = 'ok',
}

/** What the probe found. `down` covers unreachable, misconfigured and too slow alike — from here they are the same fact. */
export enum FirebaseStatus {
  Up = 'up',
  Down = 'down',
}

/**
 * Liveness, and the one dependency worth reporting next to it.
 *
 * `status` answers "is this process serving?" and keeps answering `ok` while
 * `firebaseStatus` is `down`: an orchestrator that restarted the API because the
 * database was unreachable would take down the endpoint that says so. Whatever
 * needs the database looks at `firebaseStatus` instead.
 */
export class HealthDto {
  @ApiProperty({ enum: HealthStatus, enumName: 'HealthStatus' })
  status!: HealthStatus;

  @ApiProperty({
    description: 'Seconds since the process started.',
    example: 42,
  })
  uptimeSeconds!: number;

  @ApiProperty({
    enum: FirebaseStatus,
    enumName: 'FirebaseStatus',
    description: 'Whether Firestore answered a single read within the probe deadline.',
  })
  firebaseStatus!: FirebaseStatus;
}
