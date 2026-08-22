import { Injectable } from '@nestjs/common';
import { CollectionReference, Query, Timestamp } from 'firebase-admin/firestore';
import { CONTENT_SUBCOLLECTION, LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { entityFrom } from '../core/firebase/firestore.repository';
import { LibraryContent, LibraryContentStatus, LibraryContentType } from './entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode } from './entities/library-item.entity';

/** What Firestore itself narrows an item list request by: three fields, equality only. */
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

/** What Firestore itself narrows a content list request by: two fields, equality only. */
export interface LibraryContentFilter {
  type?: LibraryContentType;
  status?: LibraryContentStatus;
}

/** Distributes over the union, so `type` still narrows the rest. */
type WithoutStamps<T> = T extends LibraryContent ? Omit<T, 'id' | 'createdAt' | 'updatedAt'> : never;

/** A content row as a caller hands it over — the id and the dates are this class's to stamp. */
export type LibraryContentDraft = WithoutStamps<LibraryContent>;

/**
 * The library's documents: one item, and the `contents` subcollection filed
 * under it. The only file that mentions Firestore — the managers above it work
 * in items, drafts and rows, and would not change if the store did.
 */
@Injectable()
export class LibraryRepository {
  constructor(private readonly firebase: FirebaseAdminService) {}

  private get items(): CollectionReference {
    return this.firebase.firestore.collection(LIBRARY_COLLECTION);
  }

  async findLibrary(id: string): Promise<LibraryItem | null> {
    return entityFrom<LibraryItem>(await this.items.doc(id).get());
  }

  /**
   * The items matching the filter, unordered and unpaged.
   *
   * Equality filters with no `orderBy` are served by merging the automatic
   * single-field indexes, so no composite index is needed for any combination.
   */
  async searchLibraries(filter: LibraryItemFilter): Promise<LibraryItem[]> {
    let query: Query = this.items;

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
    return snapshot.docs.map((document) => entityFrom<LibraryItem>(document)!);
  }

  async createLibrary(draft: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<LibraryItem> {
    const document = this.items.doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return entityFrom<LibraryItem>(await document.get())!;
  }

  /** The whole writable representation, in place — an omitted field is a cleared field. */
  async updateLibrary(id: string, update: Partial<Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<LibraryItem> {
    await this.items.doc(id).update({ ...update, updatedAt: Timestamp.now() });

    return (await this.findLibrary(id))!;
  }

  async deleteLibrary(id: string): Promise<void> {
    await this.items.doc(id).delete();
  }

  /**
   * The item's own status, and nothing else.
   *
   * A root field rather than a dotted path into `metadata`, and its own method rather
   * than `updateLibrary`: a job runner holds an id and a state, not an item.
   */
  async updateStatus(itemId: string, status: LibraryItemStatus): Promise<void> {
    await this.items.doc(itemId).update({ status, updatedAt: Timestamp.now() });
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

    await this.items.doc(itemId).update(fields);
  }

  async findLibraryContent(itemId: string, contentId: string): Promise<LibraryContent | null> {
    return entityFrom<LibraryContent>(await this.contentsOf(itemId).doc(contentId).get());
  }

  /** One item's rows, ordered by `idx` and unpaged — the search and the slice happen in the manager. */
  async searchLibraryContents(itemId: string, filter: LibraryContentFilter): Promise<LibraryContent[]> {
    let query: Query = this.contentsOf(itemId).orderBy('idx');

    if (filter.type) {
      query = query.where('type', '==', filter.type);
    }

    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }

    const snapshot = await query.get();

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => entityFrom<LibraryContent>(document)!);
  }

  async createLibraryContent(itemId: string, draft: LibraryContentDraft): Promise<LibraryContent> {
    const document = this.contentsOf(itemId).doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return entityFrom<LibraryContent>(await document.get())!;
  }

  /** The whole writable representation, in place — an omitted field is a cleared field. */
  async updateLibraryContent(itemId: string, contentId: string, draft: LibraryContentDraft): Promise<LibraryContent> {
    await this.contentsOf(itemId).doc(contentId).update({ ...draft, updatedAt: Timestamp.now() });

    return (await this.findLibraryContent(itemId, contentId))!;
  }

  async deleteLibraryContent(itemId: string, contentId: string): Promise<void> {
    await this.contentsOf(itemId).doc(contentId).delete();
  }

  /** Under one item: its `contents` subcollection, keyed by a chapter, image or clip's own id. */
  private contentsOf(itemId: string): CollectionReference {
    return this.items.doc(itemId).collection(CONTENT_SUBCOLLECTION);
  }
}
