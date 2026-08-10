import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SystemController } from './system.controller';
import { SystemManager } from './system.manager';

/**
 * The service's own status. Two controllers over one manager, because the same
 * knowledge serves two different audiences at two different URLs: `/system`,
 * for anyone asking which build they are talking to, and `/health`, for
 * whatever is watching the process stay alive.
 *
 * No repository — the service has nothing to read to describe itself, and
 * inventing one to fill the layer would be worse than leaving it out.
 */
@Module({
  controllers: [SystemController, HealthController],
  providers: [SystemManager],
  exports: [SystemManager],
})
export class SystemModule {}
