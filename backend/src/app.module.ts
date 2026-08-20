import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './core/core.module';
import { LibraryModule } from './library/library.module';
import { SystemModule } from './system/system.module';

/**
 * The composition root: cross-cutting concerns, then one import per feature.
 * Nothing else belongs here — a controller or provider declared at this level
 * has no module to own it.
 *
 * `ScrapingModule` is parked while the library contract is refactored: it reads
 * and writes through the library managers, which are out of the build for now.
 */
@Module({
  imports: [CoreModule, SystemModule, AuthModule, LibraryModule],
})
export class AppModule {}
