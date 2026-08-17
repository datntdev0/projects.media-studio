import { Module } from '@nestjs/common';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentRepository } from './library-content.repository';
import { LibraryTranslationManager } from './library-translation.manager';
import { LibraryTranslationRepository } from './library-translation.repository';
import { LibraryController } from './library.controller';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/**
 * The catalogue everything else will hang off, and what each item holds: one
 * controller over two managers over two repositories, one job each.
 *
 * One controller because content is not addressable apart from its item — see
 * `library.controller.ts`. The managers stay three: an item's rules, a row's, and
 * what a row reads like in another language are not the same rules, and the third
 * is what keeps the second under the file-length line.
 *
 * The managers are exported because the parts after this one read and write items
 * and their content without going through HTTP — a scraping job fills in the
 * chapters it fetched, and a translation workflow will fill in the rest. The
 * repositories stay in: what collection anything lives in is this module's alone.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryManager, LibraryRepository, LibraryContentManager, LibraryContentRepository, LibraryTranslationManager, LibraryTranslationRepository],
  exports: [LibraryManager, LibraryContentManager, LibraryTranslationManager],
})
export class LibraryModule {}
