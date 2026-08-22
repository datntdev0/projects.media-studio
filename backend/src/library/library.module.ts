import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryContentManager } from './library-content.manager';
import { LibraryItemManager } from './library-item.manager';
import { LibraryRepository } from './library.repository';

/**
 * The translation and media providers, and the import consumer, are still
 * parked while their DTOs and entities are refactored — see the `exclude`
 * list in `tsconfig.json`. Restore them from git alongside their own routes.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryItemManager, LibraryContentManager, LibraryRepository],
})
export class LibraryModule {}
