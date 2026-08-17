import { Module } from '@nestjs/common';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentRepository } from './library-content.repository';
import { LibraryExportManager } from './library-export.manager';
import { LibraryImportConsumer } from './library-import.handler';
import { LibraryImportManager } from './library-import.manager';
import { LibraryImportWriter } from './library-import.writer';
import { LibraryTranslationManager } from './library-translation.manager';
import { LibraryTranslationRepository } from './library-translation.repository';
import { LibraryController } from './library.controller';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/**
 * The catalogue everything else will hang off, and what each item holds: one
 * controller and one consumer over the managers, each over its own repository.
 *
 * One controller because content is not addressable apart from its item — see
 * `library.controller.ts`. The managers stay separate: an item's rules, a row's,
 * what a row reads like in another language, and what a `.zip` of the whole thing
 * means are not the same rules, and each split is what keeps the one before it
 * under the file-length line.
 *
 * The managers are exported because the parts after this one read and write items
 * and their content without going through HTTP — a scraping job fills in the
 * chapters it fetched, and a translation workflow will fill in the rest. The
 * repositories stay in: what collection anything lives in is this module's alone,
 * and so are the two package managers, which nothing but HTTP asks for a package.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryManager, LibraryRepository, LibraryContentManager, LibraryContentRepository, LibraryTranslationManager, LibraryTranslationRepository, LibraryExportManager, LibraryImportManager, LibraryImportWriter, LibraryImportConsumer],
  exports: [LibraryManager, LibraryContentManager, LibraryTranslationManager],
})
export class LibraryModule {}
