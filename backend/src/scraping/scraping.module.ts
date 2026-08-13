import { Module } from '@nestjs/common';
import { ScrapingController } from './scraping.controller';
import { ScrapingManager } from './scraping.manager';

/**
 * Reading a source: one controller over one manager.
 *
 * No providers of its own — the scraping service and the cache are infrastructure,
 * and both arrive from the global `CoreModule`. The manager is not exported yet;
 * the job runner will want it, and can export it when it exists.
 */
@Module({
  controllers: [ScrapingController],
  providers: [ScrapingManager],
})
export class ScrapingModule {}
