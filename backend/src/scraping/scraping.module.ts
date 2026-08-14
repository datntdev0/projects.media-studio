import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';

/**
 * Reading a source: one controller over one manager.
 *
 * The scraping service and the cache are infrastructure and arrive from the global
 * `CoreModule`; the two library managers discovery writes through come from
 * `LibraryModule`, which exports them and does not import this one — so there is no
 * cycle. The manager is not exported yet; the job runner will want it, and can
 * export it when it exists.
 */
@Module({
  imports: [LibraryModule],
  controllers: [ScrapingController],
  providers: [ScrapingManager],
})
export class ScrapingModule {}
