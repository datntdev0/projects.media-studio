import { DocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirestoreRepository } from './firestore.repository';

const INSTANT = '2026-08-10T09:12:04.113Z';

interface Row {
  id: string;
  [field: string]: unknown;
}

/** `toEntity` is protected — a subclass is how a spec gets at it, as a real repository would. */
class TestRepository extends FirestoreRepository<Row> {
  protected readonly collectionName = 'test';

  map(snapshot: DocumentSnapshot): Row | null {
    return this.toEntity(snapshot);
  }
}

/** No Firebase app: the mapping never reaches for one. */
const repository = new TestRepository({} as FirebaseAdminService);

function snapshot(data: Record<string, unknown> | undefined): DocumentSnapshot {
  return { id: 'current', data: () => data } as unknown as DocumentSnapshot;
}

describe('FirestoreRepository.toEntity', () => {
  it('is null for a document that is not there', () => {
    expect(repository.map(snapshot(undefined))).toBeNull();
  });

  it('files the document under its id', () => {
    expect(repository.map(snapshot({ name: 'media-studio' }))).toEqual({ id: 'current', name: 'media-studio' });
  });

  it('flattens a timestamp to an ISO string', () => {
    const entity = repository.map(snapshot({ lastStartedAt: Timestamp.fromDate(new Date(INSTANT)) }));

    expect(entity).toEqual({ id: 'current', lastStartedAt: INSTANT });
  });

  it('reaches timestamps nested in maps and arrays', () => {
    const at = Timestamp.fromDate(new Date(INSTANT));

    const entity = repository.map(snapshot({
      metadata: { discoveredAt: at, counts: { downloaded: 12 } },
      history: [{ at }, { at }],
    }));

    expect(entity).toEqual({
      id: 'current',
      metadata: { discoveredAt: INSTANT, counts: { downloaded: 12 } },
      history: [{ at: INSTANT }, { at: INSTANT }],
    });
  });

  it('leaves null a null, rather than treating it as a map', () => {
    expect(repository.map(snapshot({ sourceUrl: null }))).toEqual({ id: 'current', sourceUrl: null });
  });
});
