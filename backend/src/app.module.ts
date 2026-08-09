import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { SystemModule } from './system/system.module';

/**
 * The composition root: cross-cutting concerns, then one import per feature.
 * Nothing else belongs here — a controller or provider declared at this level
 * has no module to own it.
 */
@Module({
  imports: [CoreModule, SystemModule],
})
export class AppModule {}
