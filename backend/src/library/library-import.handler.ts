import { Processor } from '@nestjs/bullmq';
import { QueueConsumer } from '../core/queues/queue.consumer';
import { LIBRARY_IMPORT_QUEUE, LibraryImportRequested, QueueMessage } from '../core/queues/queue.messages';
import { ImportConflict } from './entities/library-package.entity';
import { LibraryImportManager } from './library-import.manager';

/**
 * One at a time. An import is a burst of Storage writes and a Firestore batch, and
 * two running at once buys nothing but contention.
 */
const IMPORT_CONCURRENCY = 1;

/**
 * A package, unpacked where nobody is waiting for it.
 *
 * Thin, as `ScrapingContentConsumer` is: unwrap, delegate, and let a throw leave the
 * message in the failed set. The manager publishes the failure to the live node
 * before rethrowing, so the dialog says why rather than hanging at sixty percent.
 */
@Processor(LIBRARY_IMPORT_QUEUE, { concurrency: IMPORT_CONCURRENCY })
export class LibraryImportConsumer extends QueueConsumer<LibraryImportRequested> {
  constructor(private readonly imports: LibraryImportManager) {
    super();
  }

  protected handle({ payload }: QueueMessage<LibraryImportRequested>): Promise<void> {
    return this.imports.run(payload.itemId, payload.packageUrl, payload.onConflict as ImportConflict);
  }
}
