// The repository's constructor names `FirebaseAdminService`, and that file reaches
// the Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { QueryListLibraryContentsDto } from './dto/library-content.dto';
import { CreateLibraryContentDto } from './dto/library-content.dto-create';
import { UpdateLibraryContentDto } from './dto/library-content.dto-update';
import { CreateLibraryItemDto } from './dto/library-item.dto-create';
import { UpdateLibraryItemDto } from './dto/library-item.dto-update';
import { QueryListLibraryItemsDto } from './dto/library-item.dto';
import { ContentLanguages, LibraryContent, LibraryContentStatus, LibraryContentType } from './entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from './entities/library-item.entity';
import { LibraryController } from './library.controller';
import { LibraryContentManager } from './library-content.manager';
import { LibraryItemManager } from './library-item.manager';
import { LibraryRepository } from './library.repository';

const NOW = '2026-08-11T09:12:04.113Z';

/** One item's `contents` subcollection, keyed by content id. */
type ContentRows = Map<string, Record<string, unknown>>;

/** One Firestore collection, held in memory — just enough of `where`/`orderBy`/`get`/`doc` for the repository above it. */
class FakeCollection {
  private autoId = 0;

  constructor(
    private readonly rows: Map<string, Record<string, unknown>>,
    private readonly contentRows: Map<string, ContentRows> = new Map(),
    private readonly filters: [string, unknown][] = [],
    private readonly order?: string,
  ) {}

  static seeded(items: LibraryItem[], contents: Record<string, LibraryContent[]> = {}): FakeCollection {
    const rows = new Map<string, Record<string, unknown>>();

    items.forEach(({ id, ...data }) => rows.set(id, data));

    const contentRows = new Map<string, ContentRows>();

    Object.entries(contents).forEach(([itemId, itemRows]) => {
      const byId: ContentRows = new Map();

      itemRows.forEach(({ id, ...data }) => byId.set(id, data));
      contentRows.set(itemId, byId);
    });

    return new FakeCollection(rows, contentRows);
  }

  where(field: string, _op: '==', value: unknown): FakeCollection {
    return new FakeCollection(this.rows, this.contentRows, [...this.filters, [field, value]], this.order);
  }

  orderBy(field: string): FakeCollection {
    return new FakeCollection(this.rows, this.contentRows, this.filters, field);
  }

  get(): Promise<{ docs: DocumentSnapshot[] }> {
    let entries = Array.from(this.rows.entries()).filter(([, data]) => this.filters.every(([field, value]) => data[field] === value));

    if (this.order) {
      const field = this.order;

      entries = [...entries].sort(([, a], [, b]) => Number(a[field]) - Number(b[field]));
    }

    return Promise.resolve({ docs: entries.map(([id, data]) => snapshot(id, data)) });
  }

  doc(id?: string): FakeDoc {
    return new FakeDoc(id ?? `auto-${++this.autoId}`, this.rows, this.contentRows);
  }
}

/** One document within `FakeCollection`, the operations `LibraryRepository` calls — including its `contents` subcollection. */
class FakeDoc {
  constructor(private readonly id: string, private readonly rows: Map<string, Record<string, unknown>>, private readonly contentRows: Map<string, ContentRows>) {}

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

  /** This item's `contents` subcollection — the only one `LibraryRepository` opens. */
  collection(): FakeCollection {
    let byId = this.contentRows.get(this.id);

    if (!byId) {
      byId = new Map();
      this.contentRows.set(this.id, byId);
    }

    return new FakeCollection(byId);
  }
}

function snapshot(id: string, data?: Record<string, unknown>): DocumentSnapshot {
  return { id, data: () => (data ? { ...data } : undefined) } as unknown as DocumentSnapshot;
}

/** The real managers over the real repository, over a Firestore that lives only in memory. */
function controllerOver(items: LibraryItem[] = [], contents: Record<string, LibraryContent[]> = {}): LibraryController {
  const collection = FakeCollection.seeded(items, contents);
  const firestore = { collection: () => collection } as unknown as Firestore;
  const firebase = { firestore } as unknown as FirebaseAdminService;

  const repository = new LibraryRepository(firebase);

  return new LibraryController(new LibraryItemManager(repository), new LibraryContentManager(repository));
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

function imageSet(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'image-1',
    type: LibraryItemType.Image,
    title: 'Brutalist Interiors',
    status: LibraryItemStatus.Draft,
    sourceMode: LibrarySourceMode.Manual,
    sourceName: 'Manual',
    sourceUrl: null,
    coverUrl: null,
    novelMetadata: null,
    imageMetadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 },
    videoMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function chapter(over: Partial<LibraryContent> = {}): LibraryContent {
  return {
    id: 'chapter-1',
    idx: 412,
    type: LibraryContentType.Original,
    status: LibraryContentStatus.Completed,
    sourceUrl: null,
    contentUrl: 'https://storage.example.com/content/uid/ch412.txt',
    language: ContentLanguages.English,
    title: 'Nine Bells for the Harbour',
    words: 2744,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as LibraryContent;
}

function asset(over: Partial<LibraryContent> = {}): LibraryContent {
  return {
    id: 'asset-1',
    idx: 1,
    type: LibraryContentType.Image,
    status: LibraryContentStatus.Completed,
    sourceUrl: null,
    contentUrl: 'https://storage.example.com/content/uid/img_001.jpg',
    filename: 'img_001.jpg',
    filesize: 2088960,
    dimensions: '1920x1080',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  } as LibraryContent;
}

function query(over: Partial<QueryListLibraryItemsDto> = {}): QueryListLibraryItemsDto {
  return { page: 1, pageSize: 20, ...over };
}

function contentQuery(over: Partial<QueryListLibraryContentsDto> = {}): QueryListLibraryContentsDto {
  return { page: 1, pageSize: 50, ...over };
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

describe('LibraryController.listContents', () => {
  const rows = [chapter({ id: 'a', title: 'A Map Drawn in Salt' }), chapter({ id: 'b', title: 'Paper Boats' }), chapter({ id: 'c', title: 'The Long Inventory', status: LibraryContentStatus.Pending })];

  it('matches the search against a title', async () => {
    const page = await controllerOver([novel()], { 'novel-1': rows }).listContents('novel-1', contentQuery({ search: 'paper' }));

    expect(page.items.map((row) => row.id)).toEqual(['b']);
  });

  it('matches the search against a filename', async () => {
    const assets = [asset({ id: 'a', filename: 'img_001.jpg' }), asset({ id: 'b', filename: 'clip_002.mp4' })];
    const page = await controllerOver([imageSet()], { 'image-1': assets }).listContents('image-1', contentQuery({ search: 'clip' }));

    expect(page.items.map((row) => row.id)).toEqual(['b']);
  });

  it('counts what matches, not what the page holds', async () => {
    const page = await controllerOver([novel()], { 'novel-1': rows }).listContents('novel-1', contentQuery({ pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });

  it('narrows by language', async () => {
    const bilingual = [chapter({ id: 'a', language: ContentLanguages.English }), chapter({ id: 'b', language: ContentLanguages.Vietnamese })];
    const page = await controllerOver([novel()], { 'novel-1': bilingual }).listContents('novel-1', contentQuery({ language: ContentLanguages.Vietnamese }));

    expect(page.items.map((row) => row.id)).toEqual(['b']);
  });

  it('refuses a `language` filter on an image item', async () => {
    await expect(controllerOver([imageSet()]).listContents('image-1', contentQuery({ language: ContentLanguages.English }))).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().listContents('missing', contentQuery())).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryController.createContent', () => {
  const body: CreateLibraryContentDto = { idx: 1, type: LibraryContentType.Original, status: LibraryContentStatus.Pending, textContent: { contentUrl: null, language: ContentLanguages.English, title: 'Paper Boats', words: 0 } };

  it('stores a chapter under a novel', async () => {
    const created = await controllerOver([novel()]).createContent('novel-1', body);

    expect(created).toMatchObject({ type: LibraryContentType.Original, textContent: { title: 'Paper Boats' } });
  });

  it('is retrievable by the id it was created under', async () => {
    const controller = controllerOver([novel()]);
    const created = await controller.createContent('novel-1', body);

    await expect(controller.getContent('novel-1', created.id)).resolves.toMatchObject({ id: created.id, textContent: { title: 'Paper Boats' } });
  });

  it('refuses a content type the item does not hold', async () => {
    const input: CreateLibraryContentDto = { idx: 1, type: LibraryContentType.Image, status: LibraryContentStatus.Pending, imageContent: { contentUrl: null, filename: 'img_001.jpg', filesize: 0, dimensions: '' } };

    await expect(controllerOver([novel()]).createContent('novel-1', input)).rejects.toThrow(BadRequestException);
  });

  it('refuses a chapter without a title', async () => {
    const input = { ...body, textContent: { contentUrl: null, language: ContentLanguages.English, title: '', words: 0 } };

    await expect(controllerOver([novel()]).createContent('novel-1', input)).rejects.toThrow(BadRequestException);
  });

  it('refuses a status only discovery or the job runner may set', async () => {
    await expect(controllerOver([novel()]).createContent('novel-1', { ...body, status: LibraryContentStatus.Discovered })).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().createContent('missing', body)).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryController.getContent', () => {
  it('answers with the stored row', async () => {
    await expect(controllerOver([novel()], { 'novel-1': [chapter()] }).getContent('novel-1', 'chapter-1')).resolves.toMatchObject({ id: 'chapter-1', textContent: { title: 'Nine Bells for the Harbour' } });
  });

  it('is a 404 for content that is not there', async () => {
    await expect(controllerOver([novel()]).getContent('novel-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().getContent('missing', 'chapter-1')).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryController.replaceContent', () => {
  const body: UpdateLibraryContentDto = { idx: 412, type: LibraryContentType.Original, status: LibraryContentStatus.Completed, textContent: { contentUrl: null, language: ContentLanguages.English, title: 'Nine Bells', words: 2744 } };

  it('rewrites the stored row', async () => {
    const replaced = await controllerOver([novel()], { 'novel-1': [chapter()] }).replaceContent('novel-1', 'chapter-1', body);

    expect(replaced).toMatchObject({ id: 'chapter-1', textContent: { title: 'Nine Bells' } });
  });

  it('clears a field the request leaves out, because a PUT is the whole representation', async () => {
    const controller = controllerOver([novel()], { 'novel-1': [chapter({ words: 2744 })] });
    const replaced = await controller.replaceContent('novel-1', 'chapter-1', { ...body, textContent: { contentUrl: null, language: ContentLanguages.English, title: 'Nine Bells', words: undefined as unknown as number } });

    expect(replaced.textContent).toMatchObject({ words: 0, contentUrl: null });
  });

  it('refuses a changed type', async () => {
    const controller = controllerOver([novel()], { 'novel-1': [chapter()] });

    await expect(controller.replaceContent('novel-1', 'chapter-1', { ...body, type: LibraryContentType.Translation })).rejects.toThrow(BadRequestException);
  });

  it('refuses a status only discovery or the job runner may set', async () => {
    const controller = controllerOver([novel()], { 'novel-1': [chapter()] });

    await expect(controller.replaceContent('novel-1', 'chapter-1', { ...body, status: LibraryContentStatus.Discovered })).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for content that is not there', async () => {
    await expect(controllerOver([novel()]).replaceContent('novel-1', 'missing', body)).rejects.toThrow(NotFoundException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(controllerOver().replaceContent('missing', 'chapter-1', body)).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryController.removeContent', () => {
  it('deletes a row that is there', async () => {
    const controller = controllerOver([novel()], { 'novel-1': [chapter()] });

    await controller.removeContent('novel-1', 'chapter-1');

    await expect(controller.getContent('novel-1', 'chapter-1')).rejects.toThrow(NotFoundException);
  });

  it('is a 404 for a row that is not there', async () => {
    await expect(controllerOver([novel()]).removeContent('novel-1', 'missing')).rejects.toThrow(NotFoundException);
  });
});
