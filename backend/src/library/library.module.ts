import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryContentManager } from './library-content.manager';
import { LibraryItemManager } from './library-item.manager';
import { LibraryPackageManager } from './library-package.manager';
import { LibraryRepository } from './library.repository';

/**
 * The import consumer is still parked while its DTOs and entities are
 * refactored — see the `exclude` list in `tsconfig.json`. Restore it from
 * git alongside its own route.
 *
 * The two managers are exported for `ScrapingModule`, which reads and writes
 * through them rather than through `LibraryRepository` directly.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryItemManager, LibraryContentManager, LibraryPackageManager, LibraryRepository],
  exports: [LibraryItemManager, LibraryContentManager],
})
export class LibraryModule {}
