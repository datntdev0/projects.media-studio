import { Injectable } from '@nestjs/common';
import { CollectionReference, Timestamp } from 'firebase-admin/firestore';
import { LIBRARY_COLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { entityFrom } from '../core/firebase/firestore.repository';
import { NovelChapter } from './entities/library-content.entity';
import { TRANSLATION_LANGUAGES, TRANSLATION_SUBCOLLECTIONS, TranslationLanguage } from './entities/library-translation.entity';

/** How many writes fit in one Firestore batch. */
const BATCH_LIMIT = 500;

/**
 * How many documents one `getAll` asks for. A page of chapters is two hundred, but an
 * export asks for the whole novel — and a single `BatchGetDocuments` of two thousand
 * refs is a request neither end enjoys.
 */
const LOOKUP_LIMIT = 300;

/** A translation as a caller hands it over. The id is the chapter's; the dates are this class's to stamp. */
export type TranslationDraft = Omit<NovelChapter, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * One translation in a batch, and what its document was first written at.
 *
 * `createdAt` is the caller's to carry because a batch cannot read: `upsert` reads the
 * stored date one document at a time, and a caller writing six hundred already has
 * them from the `findByIds` it planned with. Null is a translation that is not there yet.
 */
export interface TranslationRewrite {
  contentId: string;
  createdAt: string | null;
  draft: TranslationDraft;
}

/**
 * The `translation_*` subcollections of a library item — one per language, each
 * holding a chapter's translation under that chapter's own id.
 *
 * Does not extend `FirestoreRepository` for `LibraryContentRepository`'s reason,
 * one key further along: a row here is found by three things, the item, the
 * language and the chapter. What is worth sharing is `entityFrom`, and that is
 * what this uses.
 *
 * Keying by the chapter's id is what makes every read below a lookup: there is
 * nothing to order and nothing to filter, so these collections carry no index and
 * are never queried.
 */
@Injectable()
export class LibraryTranslationRepository {
  constructor(private readonly firebase: FirebaseAdminService) {}

  /**
   * The translations of the chapters named, keyed by the chapter each one is of.
   *
   * One round trip per `LOOKUP_LIMIT` ids, and a `Map` because the caller is about
   * to zip it against a list — a `find()` per row over two hundred rows is the
   * shape that quietly goes quadratic.
   */
  async findByIds(itemId: string, language: TranslationLanguage, contentIds: string[]): Promise<Map<string, NovelChapter>> {
    const translations = this.translationsOf(itemId, language);
    const found = new Map<string, NovelChapter>();

    for (let from = 0; from < contentIds.length; from += LOOKUP_LIMIT) {
      const refs = contentIds.slice(from, from + LOOKUP_LIMIT).map((contentId) => translations.doc(contentId));
      // `getAll` refuses an empty argument list, and an empty page is a real case.
      const snapshots = refs.length > 0 ? await this.firebase.firestore.getAll(...refs) : [];

      for (const snapshot of snapshots) {
        const row = entityFrom<NovelChapter>(snapshot);

        if (row) {
          found.set(snapshot.id, row);
        }
      }
    }

    return found;
  }

  /**
   * The translation, whether or not there was one — a `PUT` is how a translation
   * comes into existence at all.
   *
   * `set` rather than `update`, because the document may not be there, and the
   * stored `createdAt` is read first so a rewrite keeps it: the same promise
   * `LibraryContentRepository.replace` makes with its `update`.
   */
  async upsert(itemId: string, language: TranslationLanguage, contentId: string, draft: TranslationDraft): Promise<NovelChapter> {
    const document = this.translationsOf(itemId, language).doc(contentId);
    const stored = await document.get();
    const now = Timestamp.now();
    const createdAt = (stored.get('createdAt') as Timestamp | undefined) ?? now;

    await document.set({ ...draft, createdAt, updatedAt: now });

    // Built from what was written rather than read back: the write is the
    // authority on its own result.
    return { ...draft, id: contentId, createdAt: iso(createdAt), updatedAt: iso(now) };
  }

  /**
   * Many translations at once, each keeping the date its document was first written
   * at — the promise `upsert` makes one row at a time, kept for five hundred.
   */
  async upsertMany(itemId: string, language: TranslationLanguage, rows: TranslationRewrite[]): Promise<void> {
    const translations = this.translationsOf(itemId, language);

    for (let from = 0; from < rows.length; from += BATCH_LIMIT) {
      const batch = this.firebase.firestore.batch();
      const now = Timestamp.now();

      rows.slice(from, from + BATCH_LIMIT).forEach((row) => {
        const createdAt = row.createdAt ? Timestamp.fromDate(new Date(row.createdAt)) : now;

        batch.set(translations.doc(row.contentId), { ...row.draft, createdAt, updatedAt: now });
      });

      await batch.commit();
    }
  }

  /**
   * One chapter's translations, in every language, for when the chapter goes.
   *
   * Unconditional: deleting a document that is not there costs nothing, and asking
   * which languages hold one would be three reads to save three deletes.
   */
  async remove(itemId: string, contentId: string): Promise<void> {
    const batch = this.firebase.firestore.batch();

    TRANSLATION_LANGUAGES.forEach((language) => batch.delete(this.translationsOf(itemId, language).doc(contentId)));

    await batch.commit();
  }

  /** Every translation of an item, for when the item goes. Firestore does not cascade. */
  async removeAll(itemId: string): Promise<void> {
    for (const language of TRANSLATION_LANGUAGES) {
      await this.clear(this.translationsOf(itemId, language));
    }
  }

  /**
   * How many chapters each language covers, as aggregations rather than reads —
   * the same cost for a novel of twelve chapters and one of twelve hundred.
   */
  async counts(itemId: string): Promise<Record<TranslationLanguage, number>> {
    const counted = await Promise.all(TRANSLATION_LANGUAGES.map(async (language) => {
      const snapshot = await this.translationsOf(itemId, language).count().get();

      return [language, snapshot.data().count] as const;
    }));

    return Object.fromEntries(counted) as Record<TranslationLanguage, number>;
  }

  private async clear(translations: CollectionReference): Promise<void> {
    for (;;) {
      const snapshot = await translations.limit(BATCH_LIMIT).get();

      if (snapshot.empty) {
        return;
      }

      const batch = this.firebase.firestore.batch();

      snapshot.docs.forEach((document) => batch.delete(document.ref));

      await batch.commit();
    }
  }

  private translationsOf(itemId: string, language: TranslationLanguage): CollectionReference {
    return this.firebase.firestore.collection(LIBRARY_COLLECTION).doc(itemId).collection(TRANSLATION_SUBCOLLECTIONS[language]);
  }
}

function iso(at: Timestamp): string {
  return at.toDate().toISOString();
}
