import { Injectable, Logger } from '@nestjs/common';
import { AggregateField, CollectionReference, Query, Timestamp } from 'firebase-admin/firestore';
import { CONTENT_SUBCOLLECTION, LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { entityFrom } from '../core/firebase/firestore.repository';
import { LibraryContent, LibraryContentStatus } from './entities/library-content.entity';
import { LibraryItemType } from './entities/library-item.entity';

/**
 * How many of one item's rows a list request reads.
 *
 * Search and paging happen over these, in the manager — the same bargain part 1
 * struck at 500, with the headroom the largest sample novel needs. A query that
 * fills the limit says so.
 */
export const CONTENT_SCAN_LIMIT = 2000;

/** How many writes fit in one Firestore batch. */
const BATCH_LIMIT = 500;

/** What Firestore itself narrows a list request by. `type` picks the ordering, not a filter. */
export interface LibraryContentFilter {
  type: LibraryItemType;
  status?: LibraryContentStatus;
}

/** What the item's counters are built from — see `LibraryContentManager`. */
export interface LibraryContentCounts {
  total: number;
  completed: number;
  /** Rows whose attempts are spent. What decides whether a drained job settles red. */
  failed: number;
  /**
   * Rows queued or in flight — what is still owed.
   *
   * Zero is what *drained* means, and the only honest test of it: `completed === total`
   * asks whether the whole item is downloaded, which a job over a range never makes
   * true, so an item scraped in parts would wear **Scraping** for good.
   */
  pending: number;
  bytes: number;
}

/** What a running job writes to one row. Everything else about it stays where it is. */
export interface LibraryContentPatch {
  status?: LibraryContentStatus;
  contentUrl?: string | null;
  words?: number;
}

/** Distributes over the union, so `type` still narrows the rest. */
type WithoutStamps<T> = T extends LibraryContent ? Omit<T, 'id' | 'createdAt' | 'updatedAt'> : never;

/** A row as a caller hands it over — the id and the dates are this class's to stamp. */
export type LibraryContentDraft = WithoutStamps<LibraryContent>;

/**
 * The `contents` subcollection of a library item.
 *
 * Does not extend `FirestoreRepository`: that class is keyed by one id, and a row
 * here is keyed by two. Inheriting its `delete(id)` would leave a method on this
 * class pointing at the parent item. What is worth sharing — the `Timestamp` to
 * ISO mapping — is `entityFrom`, and that is what this uses.
 */
@Injectable()
export class LibraryContentRepository {
  private readonly logger = new Logger(LibraryContentRepository.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  /**
   * One item's rows, ordered but unpaged.
   *
   * Ordered by the field its type reads in: a chapter by its number, an asset by
   * its name. Both are single-field orderings, so the automatic index serves them.
   */
  async findMatching(itemId: string, filter: LibraryContentFilter): Promise<LibraryContent[]> {
    let query: Query = this.contentsOf(itemId).orderBy(orderField(filter.type));

    if (filter.status) {
      query = query.where('status', '==', filter.status);
    }

    const snapshot = await query.limit(CONTENT_SCAN_LIMIT).get();

    if (snapshot.size === CONTENT_SCAN_LIMIT) {
      this.logger.warn(`A content query filled the ${CONTENT_SCAN_LIMIT}-document scan limit — rows past it are invisible to search and paging.`);
    }

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => entityFrom<LibraryContent>(document)!);
  }

  async findOne(itemId: string, contentId: string): Promise<LibraryContent | null> {
    return entityFrom<LibraryContent>(await this.contentsOf(itemId).doc(contentId).get());
  }

  /**
   * The highest chapter number stored, or zero where none is — what the next one
   * counts from. One document, read for one field, rather than the whole scan.
   */
  async highestIndex(itemId: string): Promise<number> {
    const snapshot = await this.contentsOf(itemId).orderBy('index', 'desc').limit(1).get();

    return (snapshot.docs[0]?.get('index') as number | undefined) ?? 0;
  }

  async create(itemId: string, draft: LibraryContentDraft): Promise<LibraryContent> {
    const document = this.contentsOf(itemId).doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return { ...draft, id: document.id, createdAt: iso(now), updatedAt: iso(now) };
  }

  /** Rows a source turned out to hold. Batched, because a novel is a thousand of them. */
  async createMany(itemId: string, drafts: LibraryContentDraft[]): Promise<void> {
    const contents = this.contentsOf(itemId);

    for (let from = 0; from < drafts.length; from += BATCH_LIMIT) {
      const batch = this.firebase.firestore.batch();
      const now = Timestamp.now();

      drafts.slice(from, from + BATCH_LIMIT).forEach((draft) => batch.set(contents.doc(), { ...draft, createdAt: now, updatedAt: now }));

      await batch.commit();
    }
  }

  /**
   * The status of many rows at once, for a job that has just claimed them.
   *
   * Batched at Firestore's limit, in the loop shape `createMany` uses. One field and
   * nothing else: the rows are not the caller's to rewrite, and a queued chapter has
   * not changed in any other way.
   */
  async updateStatus(itemId: string, contentIds: string[], status: LibraryContentStatus): Promise<void> {
    const contents = this.contentsOf(itemId);

    for (let from = 0; from < contentIds.length; from += BATCH_LIMIT) {
      const batch = this.firebase.firestore.batch();
      const now = Timestamp.now();

      contentIds.slice(from, from + BATCH_LIMIT).forEach((contentId) => batch.update(contents.doc(contentId), { status, updatedAt: now }));

      await batch.commit();
    }
  }

  /**
   * The few fields a job writes as it goes, and nothing else.
   *
   * Not `replace`: that is the whole writable row, and a consumer holds none of it —
   * it knows a URL, a word count and where the row now stands.
   */
  async patch(itemId: string, contentId: string, fields: LibraryContentPatch): Promise<void> {
    await this.contentsOf(itemId).doc(contentId).update({ ...fields, updatedAt: Timestamp.now() });
  }

  /**
   * The row's whole writable representation, in place. `update` rather than `set`
   * for the one field it leaves alone: `createdAt`.
   */
  async replace(itemId: string, stored: LibraryContent, draft: LibraryContentDraft): Promise<LibraryContent> {
    const updatedAt = Timestamp.now();

    await this.contentsOf(itemId).doc(stored.id).update({ ...draft, updatedAt });

    // Built from what was written rather than read back: the write is the
    // authority on its own result.
    return { ...draft, id: stored.id, createdAt: stored.createdAt, updatedAt: iso(updatedAt) };
  }

  async remove(itemId: string, contentId: string): Promise<void> {
    await this.contentsOf(itemId).doc(contentId).delete();
  }

  /**
   * Every row of an item, for when the item itself goes. Firestore does not
   * cascade, and a subcollection left behind is documents nothing can reach.
   */
  async removeAll(itemId: string): Promise<void> {
    const contents = this.contentsOf(itemId);

    for (;;) {
      const snapshot = await contents.limit(BATCH_LIMIT).get();

      if (snapshot.empty) {
        return;
      }

      const batch = this.firebase.firestore.batch();

      snapshot.docs.forEach((document) => batch.delete(document.ref));

      await batch.commit();
    }
  }

  /**
   * What the item's counters are made of, as aggregations rather than reads: the
   * answer is the same for a novel of twelve chapters and one of twelve hundred,
   * and neither costs a document.
   */
  async counts(itemId: string): Promise<LibraryContentCounts> {
    const contents = this.contentsOf(itemId);

    const [total, completed, failed, pending, bytes] = await Promise.all([
      contents.count().get(),
      contents.where('status', '==', LibraryContentStatus.Completed).count().get(),
      contents.where('status', '==', LibraryContentStatus.Failed).count().get(),
      contents.where('status', 'in', [LibraryContentStatus.Pending, LibraryContentStatus.Scraping]).count().get(),
      contents.aggregate({ sum: AggregateField.sum('filesize') }).get(),
    ]);

    return {
      total: total.data().count,
      completed: completed.data().count,
      failed: failed.data().count,
      pending: pending.data().count,
      bytes: bytes.data().sum ?? 0,
    };
  }

  private contentsOf(itemId: string): CollectionReference {
    return this.firebase.firestore.collection(LIBRARY_COLLECTION).doc(itemId).collection(CONTENT_SUBCOLLECTION);
  }
}

/** A chapter reads in its own numbering; an asset has none, so it reads by name. */
function orderField(type: LibraryItemType): string {
  return type === LibraryItemType.Novel ? 'index' : 'filename';
}

function iso(at: Timestamp): string {
  return at.toDate().toISOString();
}
