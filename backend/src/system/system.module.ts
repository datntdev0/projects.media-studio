import { Module } from '@nestjs/common';
import { SampleAuditConsumer, SampleNotifyConsumer } from './sample.handler';
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
 *
 * The two sample consumers are here for the same reason: this is the module
 * already saying what the service is doing, and a boot is the one event it has to
 * announce. They are providers and nothing else — a `@Processor` is bound to its
 * queue by its decorator, and the queues themselves are `CoreModule`'s.
 */
@Module({
  controllers: [SystemController, HealthController],
  providers: [SystemManager, SystemRepository, SampleAuditConsumer, SampleNotifyConsumer],
  exports: [SystemManager],
})
export class SystemModule {}
