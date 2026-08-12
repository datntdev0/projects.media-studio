import { Injectable, Logger } from '@nestjs/common';
import { Query, Timestamp } from 'firebase-admin/firestore';
import { LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { FirestoreRepository } from '../core/firebase/firestore.repository';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode } from './entities/library-item.entity';

/**
 * How many filtered documents one list request reads.
 *
 * Search, ordering and paging all happen over these, in the manager — ordering by
 * `updatedAt` alongside a filter would need a composite index per filter
 * combination, which part 1 does not want. Correct while the catalogue is small,
 * and wrong past this many items, so a query that fills the limit says so.
 */
export const LIST_SCAN_LIMIT = 500;

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
  /** Only a set holds bytes — left out for a novel, whose metadata has no such field. */
  downloadedSize?: number;
}

/** Distributes over the union, so `type` still narrows `metadata`. */
type WithoutStamps<T> = T extends LibraryItem ? Omit<T, 'id' | 'createdAt' | 'updatedAt'> : never;

/** An item as a caller hands it over — the id and the dates are this class's to stamp. */
export type LibraryItemDraft = WithoutStamps<LibraryItem>;

/**
 * The library's documents. The only file that mentions Firestore: the manager
 * above it works in items and drafts, and would not change if the store did.
 */
@Injectable()
export class LibraryRepository extends FirestoreRepository<LibraryItem> {
  protected readonly collectionName = LIBRARY_COLLECTION;

  private readonly logger = new Logger(LibraryRepository.name);

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

    const snapshot = await query.limit(LIST_SCAN_LIMIT).get();

    if (snapshot.size === LIST_SCAN_LIMIT) {
      this.logger.warn(`A list query filled the ${LIST_SCAN_LIMIT}-document scan limit — items past it are invisible to search, ordering and paging.`);
    }

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => this.toEntity(document)!);
  }

  async create(draft: LibraryItemDraft): Promise<LibraryItem> {
    const document = this.collection.doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return { ...draft, id: document.id, createdAt: iso(now), updatedAt: iso(now) };
  }

  /**
   * The item's whole writable representation, in place.
   *
   * `update` rather than `set`, for the one field it leaves alone: `createdAt`.
   * Everything else is in the draft, and a `metadata` map handed over whole
   * replaces the stored one — so a field the draft dropped is gone, which is
   * exactly what `PUT` promises.
   */
  async replace(stored: LibraryItem, draft: LibraryItemDraft): Promise<LibraryItem> {
    const updatedAt = Timestamp.now();

    await this.collection.doc(stored.id).update({ ...draft, updatedAt });

    // Built from what was written rather than read back: the write is the
    // authority on its own result.
    return { ...draft, id: stored.id, createdAt: stored.createdAt, updatedAt: iso(updatedAt) };
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

function iso(at: Timestamp): string {
  return at.toDate().toISOString();
}
