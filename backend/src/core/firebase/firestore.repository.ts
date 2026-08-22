import { CollectionReference, DocumentData, DocumentSnapshot, Firestore, Timestamp } from 'firebase-admin/firestore';
import { FirebaseAdminService } from './firebase-admin.service';

/** Anything a repository hands back: the document, carrying its own id. */
export interface FirestoreEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

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

  async create(draft: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const document = this.collection.doc();
    const now = Timestamp.now();
    await document.set({ ...draft, createdAt: now, updatedAt: now });
    return this.toEntity(await document.get())!;
  }

  async update(id: string, update: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<T> {
    await this.collection.doc(id).update({ ...update, updatedAt: Timestamp.now() });
    return this.toEntity(await this.collection.doc(id).get())!;
  }

  async delete(id: string): Promise<void> {
    await this.collection.doc(id).delete();
  }

  protected toEntity(snapshot: DocumentSnapshot): T | null {
    return entityFrom<T>(snapshot);
  }
}

export function entityFrom<T extends FirestoreEntity>(snapshot: DocumentSnapshot): T | null {
  const data = snapshot.data();

  if (!data) {
    return null;
  }

  return { id: snapshot.id, ...plain(data) } as T;
}

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
