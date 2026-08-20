import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';

/**
 * Contract skeleton only. The managers, the repositories and the import consumer
 * are parked while the DTOs and entities are refactored — see the `exclude` list
 * in `tsconfig.json`. Restore the providers and the exports from git alongside them.
 */
@Module({
  controllers: [LibraryController],
})
export class LibraryModule {}
