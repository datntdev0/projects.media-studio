import { Module } from '@nestjs/common';
import { LibraryContentController } from './library-content.controller';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentRepository } from './library-content.repository';
import { LibraryController } from './library.controller';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/**
 * The catalogue everything else will hang off, and what each item holds: two
 * controllers over two managers over two repositories, one job each.
 *
 * The managers are exported because the parts after this one read and write items
 * and their content without going through HTTP — a scraping job fills in the
 * chapters it fetched. The repositories stay in: what collection anything lives in
 * is this module's alone.
 */
@Module({
  controllers: [LibraryController, LibraryContentController],
  providers: [LibraryManager, LibraryRepository, LibraryContentManager, LibraryContentRepository],
  exports: [LibraryManager, LibraryContentManager],
})
export class LibraryModule {}
