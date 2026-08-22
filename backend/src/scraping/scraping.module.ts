import { Module } from '@nestjs/common';
import { LibraryModule } from '../library/library.module';
import { ScrapingContentConsumer } from './scraping-content.handler';
import { ScrapingJobPublishConsumer } from './scraping-job.handler';
import { ScrapingRepository } from './scraping.repository';
import { ScrapingJobScheduler } from './scraping-job.scheduler';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';

/**
 * Reading a source, and fetching what it holds: one controller and two consumers,
 * over one manager and one repository for the whole scraping domain.
 *
 * The scraping service and the cache are infrastructure and arrive from the global
 * `CoreModule`; the two library managers discovery writes through come from
 * `LibraryModule`, which exports them and does not import this one — so there is no
 * cycle. The manager is not exported: nothing outside this module calls it.
 */
@Module({
  imports: [LibraryModule],
  controllers: [ScrapingController],
  providers: [ScrapingManager, ScrapingRepository, ScrapingJobScheduler, ScrapingContentConsumer, ScrapingJobPublishConsumer],
})
export class ScrapingModule {}
