import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';
import { SystemManager } from './system.manager';
import { SystemRepository } from './system.repository';

/**
 * The service's own status. Two controllers over one manager, because the same
 * knowledge serves two different audiences at two different URLs: `/system`,
 * for anyone asking which build they are talking to, and `/health`, for
 * whatever is watching the process stay alive.
 *
 * The repository is the smallest real use of the Firestore layer — one document,
 * written on boot, read by `/system`, and probed by `/health`. `/health` reports
 * what the probe found and nothing more: liveness has to stay answerable when
 * the database is not.
 */
@Module({
  controllers: [SystemController, HealthController],
  providers: [SystemManager, SystemRepository],
  exports: [SystemManager],
})
export class SystemModule {}
