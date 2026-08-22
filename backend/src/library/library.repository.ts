import { BadRequestException, Injectable } from '@nestjs/common';
import { CollectionReference, FieldPath, Query, Timestamp } from 'firebase-admin/firestore';
import { iso } from '../_shared/helper';
import { CONTENT_SUBCOLLECTION, LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { entityFrom, FirestoreRepository } from '../core/firebase/firestore.repository';
import { LibraryContent, LibraryContentStatus, LibraryContentType } from './entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode } from './entities/library-item.entity';

/** One page of a cursor-paged search — the document id is folded into the cursor as a tiebreaker. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Opaque to callers — only this file ever builds or reads one. */
function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor<T>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    throw new BadRequestException('That cursor is not one this listing gave out.');
  }
}

/** What Firestore itself narrows an item list request by: three fields, equality only. */
export interface LibraryItemFilter {
  type?: LibraryItemType;
  status?: LibraryItemStatus;
  sourceMode?: LibrarySourceMode;
}

/** Where an item's counters live — a type-specific block, never a bare `metadata`. */
const METADATA_FIELD: Record<LibraryItemType, string> = {
  [LibraryItemType.Novel]: 'novelMetadata',
  [LibraryItemType.Image]: 'imageMetadata',
  [LibraryItemType.Video]: 'videoMetadata',
};

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
 *
 * Extends the shared base for the item collection itself; the `contents`
 * subcollection, which the base knows nothing of, is this class's own.
 */
@Injectable()
export class LibraryRepository extends FirestoreRepository<LibraryItem> {
  protected readonly collectionName = LIBRARY_COLLECTION;

  constructor(firebase: FirebaseAdminService) {
    super(firebase);
  }

  async findLibrary(id: string): Promise<LibraryItem | null> {
    return this.findById(id);
  }

  /**
   * One page of the items matching the filter, newest change first.
   *
   * Firestore does the ordering, the cursoring and the limiting now, rather than
   * this reading the whole collection every time — the price is a composite index
   * per filter combination, declared in `firestore.indexes.json`. The document id
   * rides along as `updatedAt`'s tiebreaker, since two items can share one.
   */
  async searchLibraries(filter: LibraryItemFilter, pageSize: number, cursor?: string): Promise<Page<LibraryItem>> {
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

    query = query.orderBy('updatedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');

    if (cursor) {
      const { updatedAt, id } = decodeCursor<{ updatedAt: string, id: string }>(cursor);
      query = query.startAfter(Timestamp.fromDate(new Date(updatedAt)), id);
    }

    const snapshot = await query.limit(pageSize).get();

    // A query answers with documents that exist, so none of these maps to null.
    const items = snapshot.docs.map((document) => entityFrom<LibraryItem>(document)!);
    const last = items.at(-1);

    return { items, nextCursor: items.length === pageSize && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null };
  }

  async createLibrary(draft: Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<LibraryItem> {
    const document = this.collection.doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return { ...draft, id: document.id, createdAt: iso(now), updatedAt: iso(now) };
  }

  /** The whole writable representation, in place — an omitted field is a cleared field. */
  async updateLibrary(id: string, update: Partial<Omit<LibraryItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<LibraryItem> {
    return this.update(id, update);
  }

  /** Removes the item and its `contents` subcollection — Firestore deletes neither on its own. */
  async deleteLibrary(id: string): Promise<void> {
    await this.firestore.recursiveDelete(this.collection.doc(id));
  }

  /**
   * The item's own status, and nothing else.
   *
   * A root field rather than a dotted path into `metadata`, and its own method rather
   * than `updateLibrary`: a job runner holds an id and a state, not an item.
   */
  async updateStatus(itemId: string, status: LibraryItemStatus): Promise<void> {
    await this.collection.doc(itemId).update({ status, updatedAt: Timestamp.now() });
  }

  /**
   * What the item holds, after its content changed.
   *
   * Dotted paths into the type's own metadata block rather than a whole map, so
   * the descriptive fields a novel keeps beside its counters are left alone.
   * `updatedAt` moves too: content arriving is the item changing, and the
   * listing orders by it.
   */
  async updateCounters(itemId: string, type: LibraryItemType, counters: LibraryItemCounters): Promise<void> {
    const now = Timestamp.now();
    const block = METADATA_FIELD[type];

    const fields: Record<string, unknown> = {
      [`${block}.discoveredCount`]: counters.discoveredCount,
      [`${block}.discoveredAt`]: now,
      [`${block}.downloadedCount`]: counters.downloadedCount,
      updatedAt: now,
    };

    if (counters.downloadedSize !== undefined) {
      fields[`${block}.downloadedSize`] = counters.downloadedSize;
    }

    await this.collection.doc(itemId).update(fields);
  }

  async findLibraryContent(itemId: string, contentId: string): Promise<LibraryContent | null> {
    return entityFrom<LibraryContent>(await this.contentsOf(itemId).doc(contentId).get());
  }

  /** Every row matching the filter, unpaged — what a recount or a package reads in full. */
  async getLibraryContents(itemId: string, filter: LibraryContentFilter): Promise<LibraryContent[]> {
    const query = this.contentFilter(this.contentsOf(itemId), filter).orderBy('idx');
    const snapshot = await query.get();

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => entityFrom<LibraryContent>(document)!);
  }

  /**
   * One page of an item's content, in reading order.
   *
   * Paged the same way `searchLibraries` is — `idx` ordered, the document id its
   * tiebreaker for the rows that share one, a composite index per `type`/`status`
   * combination.
   */
  async searchLibraryContents(itemId: string, filter: LibraryContentFilter, pageSize: number, cursor?: string): Promise<Page<LibraryContent>> {
    let query = this.contentFilter(this.contentsOf(itemId), filter).orderBy('idx').orderBy(FieldPath.documentId());

    if (cursor) {
      const { idx, id } = decodeCursor<{ idx: number, id: string }>(cursor);
      query = query.startAfter(idx, id);
    }

    const snapshot = await query.limit(pageSize).get();

    // A query answers with documents that exist, so none of these maps to null.
    const items = snapshot.docs.map((document) => entityFrom<LibraryContent>(document)!);
    const last = items.at(-1);

    return { items, nextCursor: items.length === pageSize && last ? encodeCursor({ idx: last.idx, id: last.id }) : null };
  }

  /** The two equality filters every content query narrows by, applied the same way whichever reads all of them or a page. */
  private contentFilter(query: Query, filter: LibraryContentFilter): Query {
    let filtered = query;

    if (filter.type) {
      filtered = filtered.where('type', '==', filter.type);
    }

    if (filter.status) {
      filtered = filtered.where('status', '==', filter.status);
    }

    return filtered;
  }

  async createLibraryContent(itemId: string, draft: LibraryContentDraft): Promise<LibraryContent> {
    const document = this.contentsOf(itemId).doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return { ...draft, id: document.id, createdAt: iso(now), updatedAt: iso(now) };
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
    return this.collection.doc(itemId).collection(CONTENT_SUBCOLLECTION);
  }
}
