import { Injectable, Logger } from '@nestjs/common';
import { Query, Timestamp } from 'firebase-admin/firestore';
import { LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { FirestoreRepository } from '../core/firebase/firestore.repository';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode } from './entities/library-item.entity';

/** What Firestore itself narrows a list request by: three fields, equality only. */
export interface LibraryItemFilter {
  type?: LibraryItemType;
  status?: LibraryItemStatus;
  sourceMode?: LibrarySourceMode;
}

/** What one pass over an item's content says about it. Server-owned, every one. */
export interface LibraryItemCounters {
  discoveredCount: number;
  downloadedCount: number;
  downloadedSize?: number;
}

/**
 * The library's documents. The only file that mentions Firestore: the manager
 * above it works in items and drafts, and would not change if the store did.
 */
@Injectable()
export class LibraryItemRepository extends FirestoreRepository<LibraryItem> {
  protected readonly collectionName = LIBRARY_COLLECTION;

  private readonly logger = new Logger(LibraryItemRepository.name);

  constructor(firebase: FirebaseAdminService) {
    super(firebase);
  }

  /**
   * The items matching the filter, unordered and unpaged.
   *
   * Equality filters with no `orderBy` are served by merging the automatic
   * single-field indexes, so no composite index is needed for any combination.
   */
  async findMatching(filter: LibraryItemFilter): Promise<LibraryItem[]> {
    let query: Query = this.collection;

    if (filter.type) {
      query = query.where('type', '==', filter.type);
    }

    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }

    if (filter.sourceMode) {
      query = query.where('sourceMode', '==', filter.sourceMode);
    }

    const snapshot = await query.get();

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => this.toEntity(document)!);
  }

  /**
   * The item's own status, and nothing else.
   *
   * A root field rather than a dotted path into `metadata`, and its own method rather
   * than a `replace`: a job runner holds an id and a state, not an item.
   */
  async updateStatus(itemId: string, status: LibraryItemStatus): Promise<void> {
    await this.collection.doc(itemId).update({ status, updatedAt: Timestamp.now() });
  }

  /**
   * What the item holds, after its content changed.
   *
   * Dotted paths rather than a whole `metadata` map, so the descriptive block a
   * novel keeps beside its counters is left alone. `updatedAt` moves too: content
   * arriving is the item changing, and the listing orders by it.
   */
  async updateCounters(itemId: string, counters: LibraryItemCounters): Promise<void> {
    const now = Timestamp.now();

    const fields: Record<string, unknown> = {
      'metadata.discoveredCount': counters.discoveredCount,
      'metadata.discoveredAt': now,
      'metadata.downloadedCount': counters.downloadedCount,
      updatedAt: now,
    };

    if (counters.downloadedSize !== undefined) {
      fields['metadata.downloadedSize'] = counters.downloadedSize;
    }

    await this.collection.doc(itemId).update(fields);
  }
}
