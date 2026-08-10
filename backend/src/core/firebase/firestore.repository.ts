import { CollectionReference, DocumentData, DocumentSnapshot, Firestore, Timestamp } from 'firebase-admin/firestore';
import { FirebaseAdminService } from './firebase-admin.service';

/** Anything a repository hands back: the document, carrying its own id. */
export interface FirestoreEntity {
  id: string;
}

/**
 * What every repository shares: where its documents live, and how one becomes a
 * domain object.
 *
 * Deliberately small. It owns the two things that would otherwise be rewritten
 * per collection — the collection reference and the mapping — and stops there.
 * Queries are not generic: a repository that needs one writes it, in terms its
 * own domain uses, rather than inheriting a `find(criteria)` that has to be
 * general enough for everything and is therefore honest about nothing.
 */
export abstract class FirestoreRepository<T extends FirestoreEntity> {
  protected abstract readonly collectionName: string;

  constructor(private readonly firebase: FirebaseAdminService) {}

  protected get firestore(): Firestore {
    return this.firebase.firestore;
  }

  protected get collection(): CollectionReference {
    return this.firestore.collection(this.collectionName);
  }

  async findById(id: string): Promise<T | null> {
    return this.toEntity(await this.collection.doc(id).get());
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }

  /**
   * A document as the domain sees it: the id it is filed under, and its data
   * with every `Timestamp` flattened to an ISO string.
   *
   * The conversion is the point. A `Timestamp` is a Firestore type, and letting
   * one past this line would put the driver in the DTOs, the specs and the JSON
   * — where an ISO string is what everything already speaks.
   */
  protected toEntity(snapshot: DocumentSnapshot): T | null {
    const data = snapshot.data();

    if (!data) {
      return null;
    }

    return { id: snapshot.id, ...plain(data) } as T;
  }
}

/** Recursive: timestamps nest inside maps and arrays as readily as at the root. */
function plain(data: DocumentData): DocumentData {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, plainValue(value)]));
}

function plainValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(plainValue);
  }

  // After the two checks above, an object here is a plain map — the SDK returns
  // GeoPoint, DocumentReference and Buffer as themselves, and nothing stores one.
  if (value !== null && typeof value === 'object') {
    return plain(value);
  }

  return value;
}
