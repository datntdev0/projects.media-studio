import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';

/**
 * Reading a source, and scraping what it holds: one controller over two managers.
 *
 * The scraping service and the cache are infrastructure and arrive from the global
 * `CoreModule`; the two library managers discovery writes through come from
 * `LibraryModule`, which exports them and does not import this one — so there is no
 * cycle. Neither manager is exported: nothing outside this module calls them.
 */
@Module({
  imports: [LibraryModule],
  controllers: [ScrapingController],
  providers: [ScrapingManager, ScrapingJobManager],
})
export class ScrapingModule {}
