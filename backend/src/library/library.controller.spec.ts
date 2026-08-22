// The repository's constructor names `FirebaseAdminService`, and that file reaches
// the Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { QueryListLibraryItemsDto } from './dto/library-item.dto';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { UpdateLibraryItemDto } from './dto/library-item.dto-update';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from './entities/library-item.entity';
import { LibraryController } from './library.controller';
import { LibraryItemManager } from './library-item.manager';
import { LibraryItemRepository } from './library-item.repository';

const NOW = '2026-08-11T09:12:04.113Z';

/** One Firestore collection, held in memory — just enough of `where`/`get`/`doc` for the repository above it. */
class FakeCollection {
  private autoId = 0;

  constructor(private readonly rows: Map<string, Record<string, unknown>>, private readonly filters: [string, unknown][] = []) {}

  static seeded(items: LibraryItem[]): FakeCollection {
    const rows = new Map<string, Record<string, unknown>>();

    items.forEach(({ id, ...data }) => rows.set(id, data));

    return new FakeCollection(rows);
  }

  where(field: string, _op: '==', value: unknown): FakeCollection {
    return new FakeCollection(this.rows, [...this.filters, [field, value]]);
  }

  get(): Promise<{ docs: DocumentSnapshot[] }> {
    const docs = Array.from(this.rows.entries())
      .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
      .map(([id, data]) => snapshot(id, data));

    return Promise.resolve({ docs });
  }

  doc(id?: string): FakeDoc {
    return new FakeDoc(id ?? `auto-${++this.autoId}`, this.rows);
  }
}

/** One document within `FakeCollection`, the same four operations `FirestoreRepository` calls. */
class FakeDoc {
  constructor(private readonly id: string, private readonly rows: Map<string, Record<string, unknown>>) {}

  get(): Promise<DocumentSnapshot> {
    return Promise.resolve(snapshot(this.id, this.rows.get(this.id)));
  }

  set(data: Record<string, unknown>): Promise<void> {
    this.rows.set(this.id, { ...data });

    return Promise.resolve();
  }

  update(fields: Record<string, unknown>): Promise<void> {
    this.rows.set(this.id, { ...(this.rows.get(this.id) ?? {}), ...fields });

    return Promise.resolve();
  }

  delete(): Promise<void> {
    this.rows.delete(this.id);

    return Promise.resolve();
  }
}

function snapshot(id: string, data?: Record<string, unknown>): DocumentSnapshot {
  return { id, data: () => (data ? { ...data } : undefined) } as unknown as DocumentSnapshot;
}

/** The real manager over the real repository, over a Firestore that lives only in memory. */
function controllerOver(seed: LibraryItem[] = []): LibraryController {
  const collection = FakeCollection.seeded(seed);
  const firestore = { collection: () => collection } as unknown as Firestore;
  const firebase = { firestore } as unknown as FirebaseAdminService;

  return new LibraryController(new LibraryItemManager(new LibraryItemRepository(firebase)));
}

function novel(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    status: LibraryItemStatus.Draft,
    sourceMode: LibrarySourceMode.Manual,
    sourceName: 'Manual',
    sourceUrl: null,
    coverUrl: null,
    novelMetadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: '', genres: [], description: '' },
    imageMetadata: null,
    videoMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function query(over: Partial<QueryListLibraryItemsDto> = {}): QueryListLibraryItemsDto {
  return { page: 1, pageSize: 20, ...over };
}

describe('LibraryController.list', () => {
  const rows = [
    novel({ id: 'a', title: 'A Map Drawn in Salt', updatedAt: '2026-08-01T00:00:00.000Z' }),
    novel({ id: 'b', title: 'Paper Boats', updatedAt: '2026-08-03T00:00:00.000Z' }),
    novel({ id: 'c', title: 'The Long Inventory', status: LibraryItemStatus.Ready, updatedAt: '2026-08-02T00:00:00.000Z' }),
  ];

  it('orders by the most recently changed first', async () => {
    const page = await controllerOver(rows).list(query());

    expect(page.items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('matches the search against the title', async () => {
    const page = await controllerOver(rows).list(query({ search: 'paper' }));

    expect(page.items.map((item) => item.id)).toEqual(['b']);
  });

  it('narrows by status', async () => {
    const page = await controllerOver(rows).list(query({ status: LibraryItemStatus.Ready }));

    expect(page.items.map((item) => item.id)).toEqual(['c']);
  });

  it('counts what matches, not what the page holds', async () => {
    const page = await controllerOver(rows).list(query({ pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });
});

describe('LibraryController.create', () => {
  const body: CreateLibraryItemDto = { type: LibraryItemType.Novel, title: 'Paper Boats', status: LibraryItemStatus.Draft, sourceMode: LibrarySourceMode.Manual };

  it('stores the item and answers with it, metadata defaulted for its type', async () => {
    const created = await controllerOver().create(body);

    expect(created).toMatchObject({ title: 'Paper Boats', sourceName: 'Manual', sourceUrl: null });
    expect(created.novelMetadata).toMatchObject({ discoveredCount: 0, downloadedCount: 0, status: NovelStatus.Ongoing });
  });

  it('is retrievable by the id it was created under', async () => {
    const controller = controllerOver();
    const created = await controller.create(body);

    await expect(controller.get(created.id)).resolves.toMatchObject({ id: created.id, title: 'Paper Boats' });
  });

  it('refuses a crawler item without the URL to crawl', async () => {
    const crawler: CreateLibraryItemDto = { ...body, sourceMode: LibrarySourceMode.Crawler, sourceName: 'novel543' };

    await expect(controllerOver().create(crawler)).rejects.toThrow(BadRequestException);
  });

  it('refuses a status only the job runner may set', async () => {
    await expect(controllerOver().create({ ...body, status: LibraryItemStatus.Scraping })).rejects.toThrow(BadRequestException);
  });
});

describe('LibraryController.get', () => {
  it('answers with the stored item', async () => {
    await expect(controllerOver([novel()]).get('novel-1')).resolves.toMatchObject({ id: 'novel-1', title: 'The Silent Cartographer' });
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().get('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryController.replace', () => {
  const body: UpdateLibraryItemDto = { type: LibraryItemType.Novel, title: 'Nine Bells', status: LibraryItemStatus.Ready, sourceMode: LibrarySourceMode.Manual };

  it('rewrites the stored item', async () => {
    const replaced = await controllerOver([novel()]).replace('novel-1', body);

    expect(replaced).toMatchObject({ id: 'novel-1', title: 'Nine Bells', status: LibraryItemStatus.Ready });
  });

  it('clears a field the request leaves out, because a PUT is the whole representation', async () => {
    const seeded = novel({ novelMetadata: { discoveredCount: 4, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: 'Nguyen Van A', language: 'en', genres: ['fantasy'], description: 'A tale.' } });

    const replaced = await controllerOver([seeded]).replace('novel-1', body);

    expect(replaced.novelMetadata).toMatchObject({ author: '', language: '', genres: [], description: '' });
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().replace('missing', body)).rejects.toThrow(NotFoundException);
  });

  it('refuses a changed type', async () => {
    await expect(controllerOver([novel()]).replace('novel-1', { ...body, type: LibraryItemType.Image })).rejects.toThrow(BadRequestException);
  });
});

describe('LibraryController.remove', () => {
  it('deletes the stored item', async () => {
    const controller = controllerOver([novel()]);

    await controller.remove('novel-1');

    await expect(controller.get('novel-1')).rejects.toThrow(NotFoundException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().remove('missing')).rejects.toThrow(NotFoundException);
  });
});
