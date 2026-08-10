import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/**
 * The catalogue everything else will hang off: controller over manager over
 * repository, one job each.
 *
 * The manager is exported because the parts after this one read and write items
 * without going through HTTP — a scraping job updates the counters it fills. The
 * repository stays in: what collection the items live in is this module's alone.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryManager, LibraryRepository],
  exports: [LibraryManager],
})
export class LibraryModule {}
