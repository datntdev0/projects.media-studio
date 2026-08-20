import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/**
 * The content, translation and media providers, and the import consumer, are
 * still parked while their DTOs and entities are refactored — see the `exclude`
 * list in `tsconfig.json`. Restore them from git alongside their own routes.
 */
@Module({
  controllers: [LibraryController],
  providers: [LibraryManager, LibraryRepository],
})
export class LibraryModule {}
