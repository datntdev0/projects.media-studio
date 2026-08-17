// The manager's constructor names its repository, and that file reaches the
// Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { QueryListLibraryItemsDto } from './dto/query-list-library-items.dto';
import { UpdateLibraryItemDto } from './dto/library-item-update.dto';
import { ImageSetItem, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { TRANSLATION_LANGUAGES, TranslationCoverage, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentCounts, LibraryContentRepository } from './library-content.repository';
import { LibraryTranslationManager } from './library-translation.manager';
import { LibraryManager } from './library.manager';
import { LibraryItemDraft, LibraryItemFilter, LibraryRepository } from './library.repository';

const NOW = '2026-08-10T09:12:04.113Z';

const EARLIER = '2026-08-09T09:12:04.113Z';

const EARLIEST = '2026-08-08T09:12:04.113Z';

/**
 * What the manager needs of Firestore, by hand: the equality filters, and the
 * three writes — each stamping its dates the way the real repository does, since
 * that is what the manager relies on and nothing more.
 */
class FakeRepository {
  deleted: string[] = [];

  constructor(public items: LibraryItem[] = []) {}

  findMatching(filter: LibraryItemFilter): Promise<LibraryItem[]> {
    return Promise.resolve(
      this.items.filter((item) => (!filter.type || item.type === filter.type) && (!filter.status || item.status === filter.status) && (!filter.sourceMode || item.sourceMode === filter.sourceMode)),
    );
  }

  findById(id: string): Promise<LibraryItem | null> {
    return Promise.resolve(this.items.find((item) => item.id === id) ?? null);
  }

  create(draft: LibraryItemDraft): Promise<LibraryItem> {
    return Promise.resolve({ ...draft, id: 'created', createdAt: NOW, updatedAt: NOW });
  }

  replace(stored: LibraryItem, draft: LibraryItemDraft): Promise<LibraryItem> {
    return Promise.resolve({ ...draft, id: stored.id, createdAt: stored.createdAt, updatedAt: NOW });
  }

  delete(id: string): Promise<void> {
    this.deleted.push(id);

    return Promise.resolve();
  }
}

/** The two methods `LibraryManager` reaches for: the cascade behind a delete, and the counts it publishes. */
class FakeContentRepository {
  cleared: string[] = [];

  constructor(private readonly counted: LibraryContentCounts = { total: 0, completed: 0, failed: 0, pending: 0, bytes: 0 }) {}

  removeAll(itemId: string): Promise<void> {
    this.cleared.push(itemId);

    return Promise.resolve();
  }

  counts(): Promise<LibraryContentCounts> {
    return Promise.resolve(this.counted);
  }
}

/** The three methods `LibraryManager` reaches for, each recording that it was reached for. */
class FakeTranslationManager {
  counted: string[] = [];

  cleared: string[] = [];

  constructor(private readonly translated = 0) {}

  coverage(item: LibraryItem): Promise<TranslationCoverage[] | null> {
    if (item.type !== LibraryItemType.Novel) {
      return Promise.resolve(null);
    }

    this.counted.push(item.id);

    return Promise.resolve(TRANSLATION_LANGUAGES.map((language) => ({ language, translated: this.translated })));
  }

  removeAll(itemId: string): Promise<void> {
    this.cleared.push(itemId);

    return Promise.resolve();
  }
}

function managerOver(repository: FakeRepository, contents = new FakeContentRepository(), translations = new FakeTranslationManager()): LibraryManager {
  return new LibraryManager(repository as unknown as LibraryRepository, contents as unknown as LibraryContentRepository, translations as unknown as LibraryTranslationManager);
}

function novel(over: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: 'novelbin.crawler',
    sourceUrl: 'https://novelbin.net/n/silent-cartographer',
    status: LibraryItemStatus.Ready,
    metadata: {
      discoveredCount: 640,
      discoveredAt: EARLIER,
      downloadedCount: 412,
      status: NovelStatus.Ongoing,
      author: 'Nguyen Van A',
      language: 'en',
      genres: ['fantasy', 'adventure'],
      description: 'A cartographer maps a coast that keeps moving.',
    },
    createdAt: EARLIEST,
    updatedAt: EARLIER,
    ...over,
  };
}

function imageSet(over: Partial<ImageSetItem> = {}): ImageSetItem {
  return {
    id: 'images-1',
    type: LibraryItemType.Image,
    title: 'Character Sheets — Vol. 1',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Manual,
    sourceName: 'Manual',
    sourceUrl: null,
    status: LibraryItemStatus.Ready,
    metadata: { discoveredCount: 36, discoveredAt: EARLIER, downloadedCount: 36, downloadedSize: 12_800 },
    createdAt: EARLIEST,
    updatedAt: EARLIEST,
    ...over,
  };
}

/** A read-edit-write body: the stored item as a client would send it back. */
function bodyOf(item: LibraryItem, over: Partial<UpdateLibraryItemDto> = {}): UpdateLibraryItemDto {
  return {
    type: item.type,
    title: item.title,
    coverUrl: item.coverUrl,
    sourceMode: item.sourceMode,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    status: LibraryItemStatus.Ready,
    ...over,
  };
}

function query(over: Partial<QueryListLibraryItemsDto> = {}): QueryListLibraryItemsDto {
  return { page: 1, pageSize: 20, ...over };
}

describe('LibraryManager.create', () => {
  const manual: CreateLibraryItemDto = { type: LibraryItemType.Novel, title: 'Notes on a Quiet Harbour', sourceMode: LibrarySourceMode.Manual };

  it('starts a manual item at draft, called Manual, holding nothing', async () => {
    const created = await managerOver(new FakeRepository()).create(manual);

    expect(created).toMatchObject({
      status: LibraryItemStatus.Draft,
      sourceName: 'Manual',
      sourceUrl: null,
      coverUrl: null,
      metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0 },
    });
  });

  it('defaults the novel block a client left out', async () => {
    const created = await managerOver(new FakeRepository()).create(manual);

    expect(created.metadata).toMatchObject({ status: NovelStatus.Ongoing, author: '', language: '', genres: [], description: '' });
  });

  it('keeps the novel block a client sent', async () => {
    const created = await managerOver(new FakeRepository()).create({ ...manual, metadata: { author: 'Lin Wei', genres: ['xianxia'] } });

    expect(created.metadata).toMatchObject({ author: 'Lin Wei', genres: ['xianxia'], language: '' });
  });

  it('keeps the inventory a client stated', async () => {
    const created = await managerOver(new FakeRepository()).create({ ...manual, metadata: { discoveredCount: 640, discoveredAt: EARLIER } });

    expect(created.metadata).toMatchObject({ discoveredCount: 640, discoveredAt: EARLIER, downloadedCount: 0 });
  });

  it('lets a set state its inventory, which every type has', async () => {
    const input: CreateLibraryItemDto = { type: LibraryItemType.Image, title: 'Night Market Textures', sourceMode: LibrarySourceMode.Manual, metadata: { discoveredCount: 36 } };

    const created = await managerOver(new FakeRepository()).create(input);

    expect(created.metadata).toMatchObject({ discoveredCount: 36, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 });
  });

  it('zeroes the size a set has not downloaded', async () => {
    const created = await managerOver(new FakeRepository()).create({ type: LibraryItemType.Video, title: 'B-roll — Coastal Cities', sourceMode: LibrarySourceMode.Manual });

    expect(created.metadata).toMatchObject({ downloadedSize: 0, downloadedDuration: 0 });
  });

  it('refuses a crawler item with no URL to crawl', async () => {
    const input: CreateLibraryItemDto = { ...manual, sourceMode: LibrarySourceMode.Crawler, sourceName: 'novelbin.crawler' };

    await expect(managerOver(new FakeRepository()).create(input)).rejects.toThrow(BadRequestException);
  });

  it('refuses a crawler item that does not say which crawler', async () => {
    const input: CreateLibraryItemDto = { ...manual, sourceMode: LibrarySourceMode.Crawler, sourceUrl: 'https://novelbin.net/n/quiet-harbour' };

    await expect(managerOver(new FakeRepository()).create(input)).rejects.toThrow(BadRequestException);
  });

  it('refuses a URL on a manual item, which has nothing to read', async () => {
    const input: CreateLibraryItemDto = { ...manual, sourceUrl: 'https://novelbin.net/n/quiet-harbour' };

    await expect(managerOver(new FakeRepository()).create(input)).rejects.toThrow(BadRequestException);
  });

  it('refuses a novel-only field on an image item, which has nothing to say about a work', async () => {
    const input: CreateLibraryItemDto = { type: LibraryItemType.Image, title: 'Night Market Textures', sourceMode: LibrarySourceMode.Manual, metadata: { author: 'Lin Wei' } };

    await expect(managerOver(new FakeRepository()).create(input)).rejects.toThrow(BadRequestException);
  });
});

describe('LibraryManager.replace', () => {
  it('carries over what is downloaded and clears what the body left out', async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    const replaced = await manager.replace(stored.id, bodyOf(stored, { metadata: { author: 'Nguyen Van B' } }));

    expect(replaced.metadata).toEqual({
      discoveredCount: 0,
      discoveredAt: null,
      downloadedCount: 412,
      status: NovelStatus.Ongoing,
      author: 'Nguyen Van B',
      language: '',
      genres: [],
      description: '',
    });
  });

  it('keeps the inventory a body sends back', async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    const replaced = await manager.replace(stored.id, bodyOf(stored, { metadata: { discoveredCount: 641, discoveredAt: NOW } }));

    expect(replaced.metadata).toMatchObject({ discoveredCount: 641, discoveredAt: NOW, downloadedCount: 412 });
  });

  it('leaves a set\'s metadata as it was found when the body sends it back', async () => {
    const stored = imageSet();
    const manager = managerOver(new FakeRepository([stored]));
    const sameInventory = { discoveredCount: stored.metadata.discoveredCount, discoveredAt: stored.metadata.discoveredAt };

    const replaced = await manager.replace(stored.id, bodyOf(stored, { title: 'Character Sheets — Vol. 2', metadata: sameInventory }));

    expect(replaced.metadata).toEqual(stored.metadata);
    expect(replaced.title).toBe('Character Sheets — Vol. 2');
  });

  it('clears a set\'s inventory the body left out, and keeps what it holds', async () => {
    const stored = imageSet();
    const manager = managerOver(new FakeRepository([stored]));

    const replaced = await manager.replace(stored.id, bodyOf(stored));

    expect(replaced.metadata).toEqual({ discoveredCount: 0, discoveredAt: null, downloadedCount: 36, downloadedSize: 12_800 });
  });

  it('keeps createdAt and stamps updatedAt', async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    const replaced = await manager.replace(stored.id, bodyOf(stored));

    expect(replaced).toMatchObject({ id: stored.id, createdAt: EARLIEST, updatedAt: NOW });
  });

  it('refuses a changed type', async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    await expect(manager.replace(stored.id, bodyOf(stored, { type: LibraryItemType.Image }))).rejects.toThrow(BadRequestException);
  });

  it('refuses a changed source mode', async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    await expect(manager.replace(stored.id, bodyOf(stored, { sourceMode: LibrarySourceMode.Manual }))).rejects.toThrow(BadRequestException);
  });

  it("refuses a status that is the job runner's", async () => {
    const stored = novel();
    const manager = managerOver(new FakeRepository([stored]));

    await expect(manager.replace(stored.id, bodyOf(stored, { status: LibraryItemStatus.Scraping }))).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an id that is not there', async () => {
    const manager = managerOver(new FakeRepository());

    await expect(manager.replace('missing', bodyOf(novel()))).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryManager.list', () => {
  const items = [novel({ id: 'a', title: 'Ash of the Ninth Sky', updatedAt: EARLIEST }), novel({ id: 'b', updatedAt: NOW }), imageSet({ id: 'c', updatedAt: EARLIER })];

  it('orders by the most recent change', async () => {
    const page = await managerOver(new FakeRepository(items)).list(query());

    expect(page.items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns rows, which carry everything but createdAt', async () => {
    const stored = novel();
    const page = await managerOver(new FakeRepository([stored])).list(query());

    expect(page.items[0]).toEqual({
      id: stored.id,
      type: stored.type,
      title: stored.title,
      coverUrl: stored.coverUrl,
      sourceMode: stored.sourceMode,
      sourceName: stored.sourceName,
      sourceUrl: stored.sourceUrl,
      status: stored.status,
      metadata: stored.metadata,
      updatedAt: stored.updatedAt,
    });
  });

  it('counts what matches the filter, not what the page holds', async () => {
    const page = await managerOver(new FakeRepository(items)).list(query({ pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('slices the page asked for', async () => {
    const page = await managerOver(new FakeRepository(items)).list(query({ page: 2, pageSize: 2 }));

    expect(page.items.map((item) => item.id)).toEqual(['a']);
  });

  it("searches the title, the source name and a novel's author", async () => {
    const manager = managerOver(new FakeRepository(items));

    await expect(manager.list(query({ search: 'ninth' }))).resolves.toMatchObject({ total: 1 });
    await expect(manager.list(query({ search: 'NGUYEN VAN A' }))).resolves.toMatchObject({ total: 2 });
    await expect(manager.list(query({ search: 'Manual' }))).resolves.toMatchObject({ total: 1 });
    await expect(manager.list(query({ search: 'nothing here' }))).resolves.toMatchObject({ total: 0 });
  });

  it('leaves the enum filters to the repository', async () => {
    const page = await managerOver(new FakeRepository(items)).list(query({ type: LibraryItemType.Image }));

    expect(page.items.map((item) => item.id)).toEqual(['c']);
  });
});

describe('LibraryManager.remove', () => {
  it('deletes an item that is there', async () => {
    const repository = new FakeRepository([novel()]);

    await managerOver(repository).remove('novel-1');

    expect(repository.deleted).toEqual(['novel-1']);
  });

  it('clears the content filed under it, since Firestore does not cascade', async () => {
    const contents = new FakeContentRepository();

    await managerOver(new FakeRepository([novel()]), contents).remove('novel-1');

    expect(contents.cleared).toEqual(['novel-1']);
  });

  it('is a 404 for an id that is not there, and deletes nothing', async () => {
    const repository = new FakeRepository();
    const contents = new FakeContentRepository();

    await expect(managerOver(repository, contents).remove('missing')).rejects.toThrow(NotFoundException);
    expect(repository.deleted).toEqual([]);
    expect(contents.cleared).toEqual([]);
  });

  it('clears the translations too, which are three more subcollections', async () => {
    const translations = new FakeTranslationManager();

    await managerOver(new FakeRepository([novel()]), new FakeContentRepository(), translations).remove('novel-1');

    expect(translations.cleared).toEqual(['novel-1']);
  });
});

describe('LibraryManager translation coverage', () => {
  it('carries all three languages on a novel it answers with whole', async () => {
    const item = await managerOver(new FakeRepository([novel()]), new FakeContentRepository(), new FakeTranslationManager(412)).get('novel-1');

    expect(item.translations).toEqual([
      { language: TranslationLanguage.Vietnamese, translated: 412 },
      { language: TranslationLanguage.English, translated: 412 },
      { language: TranslationLanguage.Chinese, translated: 412 },
    ]);
  });

  it('carries null on a set, and counts nothing to say so', async () => {
    const translations = new FakeTranslationManager();
    const item = await managerOver(new FakeRepository([imageSet()]), new FakeContentRepository(), translations).get('images-1');

    expect(item.translations).toBeNull();
    expect(translations.counted).toEqual([]);
  });

  // The listing draws no dropdown, and a page of twenty novels would otherwise be
  // sixty aggregations for a question nothing on that screen asks.
  it('is never computed for the listing', async () => {
    const translations = new FakeTranslationManager();

    await managerOver(new FakeRepository([novel(), novel({ id: 'novel-2' })]), new FakeContentRepository(), translations).list(query());

    expect(translations.counted).toEqual([]);
  });
});
