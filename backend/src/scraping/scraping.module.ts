import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ContentScrapeConsumer } from './content-scrape.handler';
import { ScrapingJobManager } from './scraping-job.manager';
import { ScrapingJobRepository } from './scraping-job.repository';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';

/**
 * Reading a source, and fetching what it holds: one controller and one consumer over
 * two managers.
 *
 * The scraping service and the cache are infrastructure and arrive from the global
 * `CoreModule`; the two library managers discovery writes through come from
 * `LibraryModule`, which exports them and does not import this one — so there is no
 * cycle. Neither manager is exported: nothing outside this module calls them.
 */
@Module({
  imports: [LibraryModule],
  controllers: [ScrapingController],
  providers: [ScrapingManager, ScrapingJobManager, ScrapingJobRepository, ContentScrapeConsumer],
})
export class ScrapingModule {}
