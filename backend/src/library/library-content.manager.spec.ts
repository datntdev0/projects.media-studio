// The manager's constructor names its repositories, and those files reach the
// Admin SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest
// cannot require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException, NotImplementedException } from '@nestjs/common';
import { RealtimeProvider, ScrapingContentRow, ScrapingStatusSnapshot } from '../core/providers/realtime.provider';
import { QueryListLibraryContentsDto } from './dto/query-list-library-contents.dto';
import { ImageAsset, LibraryContent, LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { ImageSetItem, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentCounts, LibraryContentDraft, LibraryContentFilter, LibraryContentPatch, LibraryContentRepository } from './library-content.repository';
import { LibraryItemCounters, LibraryRepository } from './library.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const TEXT_URL = 'https://storage.example.com/content/uid/ch412.txt';

const IMAGE_URL = 'https://storage.example.com/content/uid/img_001.jpg';

const CHAPTER_URL = 'https://www.novel543.com/0612559073/8096_3.html';

/** What the content manager needs of the item collection: the lookup, and the counters it writes. */
class FakeItemRepository {
  counters: { itemId: string, counters: LibraryItemCounters }[] = [];

  constructor(public items: LibraryItem[] = []) {}

  findById(id: string): Promise<LibraryItem | null> {
    return Promise.resolve(this.items.find((item) => item.id === id) ?? null);
  }

  updateCounters(itemId: string, counters: LibraryItemCounters): Promise<void> {
    this.counters.push({ itemId, counters });

    return Promise.resolve();
  }
}

/** The subcollection, by hand — stamping its dates the way the real repository does. */
class FakeContentRepository {
  removed: string[] = [];

  /** Every batched status write, in order, so a test can see what was claimed and as what. */
  statuses: { contentIds: string[], status: LibraryContentStatus }[] = [];

  /** Every narrow write, in order — the shape a running job uses. */
  patches: { contentId: string, fields: LibraryContentPatch }[] = [];

  constructor(public rows: LibraryContent[] = []) {}

  findMatching(itemId: string, filter: LibraryContentFilter): Promise<LibraryContent[]> {
    return Promise.resolve(this.rows.filter((row) => !filter.status || row.status === filter.status));
  }

  findOne(itemId: string, contentId: string): Promise<LibraryContent | null> {
    return Promise.resolve(this.rows.find((row) => row.id === contentId) ?? null);
  }

  highestIndex(): Promise<number> {
    return Promise.resolve(this.rows.reduce((highest, row) => (row.type === LibraryItemType.Novel ? Math.max(highest, row.index) : highest), 0));
  }

  create(itemId: string, draft: LibraryContentDraft): Promise<LibraryContent> {
    return Promise.resolve({ ...draft, id: 'created', createdAt: NOW, updatedAt: NOW });
  }

  replace(itemId: string, stored: LibraryContent, draft: LibraryContentDraft): Promise<LibraryContent> {
    return Promise.resolve({ ...draft, id: stored.id, createdAt: stored.createdAt, updatedAt: NOW });
  }

  remove(itemId: string, contentId: string): Promise<void> {
    this.removed.push(contentId);

    return Promise.resolve();
  }

  updateStatus(itemId: string, contentIds: string[], status: LibraryContentStatus): Promise<void> {
    this.statuses.push({ contentIds, status });
    this.rows = this.rows.map((row) => (contentIds.includes(row.id) ? { ...row, status } : row));

    return Promise.resolve();
  }

  patch(itemId: string, contentId: string, fields: LibraryContentPatch): Promise<void> {
    this.patches.push({ contentId, fields });
    // Applied rather than only recorded, so a `counts()` after a completion agrees
    // with it — which is the whole of what `completeScrape` answers with.
    this.rows = this.rows.map((row) => (row.id === contentId ? { ...row, ...fields } : row));

    return Promise.resolve();
  }

  counts(): Promise<LibraryContentCounts> {
    const counted = (...states: LibraryContentStatus[]) => this.rows.filter((row) => states.includes(row.status)).length;

    return Promise.resolve({
      total: this.rows.length,
      completed: counted(LibraryContentStatus.Completed),
      failed: counted(LibraryContentStatus.Failed),
      pending: counted(LibraryContentStatus.Pending, LibraryContentStatus.Scraping),
      bytes: 4096,
    });
  }
}

/** The live tree, recorded rather than written — nothing here reaches the Realtime Database. */
class FakeRealtimeProvider {
  summaries: ScrapingStatusSnapshot[] = [];

  queued: ScrapingContentRow[] = [];

  rows: { contentId: string, status: string }[] = [];

  cleared: string[] = [];

  publishItem(itemId: string, snapshot: ScrapingStatusSnapshot): Promise<void> {
    this.summaries.push(snapshot);

    return Promise.resolve();
  }

  publishQueued(itemId: string, rows: ScrapingContentRow[]): Promise<void> {
    this.queued.push(...rows);

    return Promise.resolve();
  }

  publishContent(itemId: string, contentId: string, status: string): Promise<void> {
    this.rows.push({ contentId, status });

    return Promise.resolve();
  }

  clearContents(itemId: string): Promise<void> {
    this.cleared.push(itemId);

    return Promise.resolve();
  }

  clear(itemId: string): Promise<void> {
    this.cleared.push(itemId);

    return Promise.resolve();
  }
}

function managerOver(contents: FakeContentRepository, items: FakeItemRepository, realtime = new FakeRealtimeProvider()): LibraryContentManager {
  return new LibraryContentManager(contents as unknown as LibraryContentRepository, items as unknown as LibraryRepository, realtime as unknown as RealtimeProvider);
}

function novel(over: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Manual,
    sourceName: 'Manual',
    sourceUrl: null,
    status: LibraryItemStatus.Draft,
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: '', genres: [], description: '' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function imageSet(over: Partial<ImageSetItem> = {}): ImageSetItem {
  return {
    id: 'image-1',
    type: LibraryItemType.Image,
    title: 'Brutalist Interiors',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Manual,
    sourceName: 'Manual',
    sourceUrl: null,
    status: LibraryItemStatus.Draft,
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function chapter(over: Partial<NovelChapter> = {}): NovelChapter {
  return {
    id: 'chapter-1',
    type: LibraryItemType.Novel,
    index: 412,
    title: 'Nine Bells for the Harbour',
    language: 'en',
    words: 2744,
    sourceUrl: null,
    contentUrl: TEXT_URL,
    status: LibraryContentStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function asset(over: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'asset-1',
    type: LibraryItemType.Image,
    filename: 'img_001.jpg',
    filesize: 2088960,
    sourceUrl: null,
    contentUrl: IMAGE_URL,
    status: LibraryContentStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function query(over: Partial<QueryListLibraryContentsDto> = {}): QueryListLibraryContentsDto {
  return { page: 1, pageSize: 50, ...over };
}

describe('LibraryContentManager.create', () => {
  it('takes its type from the item, not the request', async () => {
    const created = await managerOver(new FakeContentRepository(), new FakeItemRepository([novel()])).create('novel-1', { title: 'Paper Boats' });

    expect(created.type).toBe(LibraryItemType.Novel);
  });

  it('numbers a chapter one past the highest stored', async () => {
    const contents = new FakeContentRepository([chapter({ index: 412 })]);
    const created = await managerOver(contents, new FakeItemRepository([novel()])).create('novel-1', { title: 'Paper Boats' });

    expect(created).toMatchObject({ index: 413 });
  });

  it('numbers the first chapter 1', async () => {
    const created = await managerOver(new FakeContentRepository(), new FakeItemRepository([novel()])).create('novel-1', { title: 'Paper Boats' });

    expect(created).toMatchObject({ index: 1 });
  });

  it('honours an index the request does state', async () => {
    const created = await managerOver(new FakeContentRepository(), new FakeItemRepository([novel()])).create('novel-1', { title: 'Paper Boats', index: 9 });

    expect(created).toMatchObject({ index: 9 });
  });

  it('is pending without a URL and completed with one', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([novel()]));

    await expect(manager.create('novel-1', { title: 'Paper Boats' })).resolves.toMatchObject({ status: LibraryContentStatus.Pending, contentUrl: null });
    await expect(manager.create('novel-1', { title: 'Paper Boats', contentUrl: TEXT_URL })).resolves.toMatchObject({ status: LibraryContentStatus.Completed });
  });

  it('refuses a chapter without a title', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([novel()]));

    await expect(manager.create('novel-1', {})).rejects.toThrow(BadRequestException);
  });

  it('refuses a chapter carrying the fields of a file', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([novel()]));

    await expect(manager.create('novel-1', { title: 'Paper Boats', filename: 'img_001.jpg' })).rejects.toThrow(BadRequestException);
  });

  it('refuses an asset without a filename', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([imageSet()]));

    await expect(manager.create('image-1', { contentUrl: IMAGE_URL })).rejects.toThrow(BadRequestException);
  });

  it('refuses an asset carrying the fields of a chapter', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([imageSet()]));

    await expect(manager.create('image-1', { filename: 'img_001.jpg', title: 'Paper Boats' })).rejects.toThrow(BadRequestException);
  });

  it('is a 404 for an item that is not there', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository());

    await expect(manager.create('missing', { title: 'Paper Boats' })).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryContentManager counters', () => {
  it('tells the novel what it now holds, and no size, since a novel metadata has none', async () => {
    const items = new FakeItemRepository([novel()]);

    await managerOver(new FakeContentRepository([chapter(), chapter({ id: 'chapter-2', status: LibraryContentStatus.Pending })]), items).create('novel-1', { title: 'Paper Boats' });

    expect(items.counters).toEqual([{ itemId: 'novel-1', counters: { discoveredCount: 2, downloadedCount: 1, downloadedSize: undefined } }]);
  });

  it('tells a set its size too', async () => {
    const items = new FakeItemRepository([imageSet()]);

    await managerOver(new FakeContentRepository([asset()]), items).create('image-1', { filename: 'img_002.jpg' });

    expect(items.counters).toEqual([{ itemId: 'image-1', counters: { discoveredCount: 1, downloadedCount: 1, downloadedSize: 4096 } }]);
  });

  it('recounts after a delete as readily as after a write', async () => {
    const items = new FakeItemRepository([novel()]);

    await managerOver(new FakeContentRepository([chapter()]), items).remove('novel-1', 'chapter-1');

    expect(items.counters).toHaveLength(1);
  });
});

describe('LibraryContentManager.replace', () => {
  it('keeps the stored index where the request leaves it out', async () => {
    const contents = new FakeContentRepository([chapter({ index: 412 })]);
    const replaced = await managerOver(contents, new FakeItemRepository([novel()])).replace('novel-1', 'chapter-1', { title: 'Nine Bells' });

    expect(replaced).toMatchObject({ index: 412 });
  });

  it('clears a field the request left out, because a PUT is the whole representation', async () => {
    const contents = new FakeContentRepository([chapter({ language: 'en', words: 2744 })]);
    const replaced = await managerOver(contents, new FakeItemRepository([novel()])).replace('novel-1', 'chapter-1', { title: 'Nine Bells' });

    expect(replaced).toMatchObject({ language: '', words: 0, contentUrl: null, status: LibraryContentStatus.Pending });
  });

  it('keeps the source URL a request leaves out, so a rename cannot orphan a scraped chapter', async () => {
    const contents = new FakeContentRepository([chapter({ sourceUrl: CHAPTER_URL })]);
    const replaced = await managerOver(contents, new FakeItemRepository([novel()])).replace('novel-1', 'chapter-1', { title: 'Nine Bells' });

    // Cleared, the row would have no address left to re-scrape from — and the job
    // runner would drop it as unfetchable and report it as skipped.
    expect(replaced).toMatchObject({ sourceUrl: CHAPTER_URL });
  });

  it('keeps it even where the request states it as null', async () => {
    const contents = new FakeContentRepository([chapter({ sourceUrl: CHAPTER_URL })]);
    const replaced = await managerOver(contents, new FakeItemRepository([novel()])).replace('novel-1', 'chapter-1', { title: 'Nine Bells', sourceUrl: null });

    expect(replaced).toMatchObject({ sourceUrl: CHAPTER_URL });
  });

  it('is a 404 for content that is not under this item', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository([novel()]));

    await expect(manager.replace('novel-1', 'somebody-elses', { title: 'Nine Bells' })).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryContentManager.list', () => {
  const rows = [chapter({ id: 'a', title: 'A Map Drawn in Salt' }), chapter({ id: 'b', title: 'Paper Boats' }), chapter({ id: 'c', title: 'The Long Inventory', status: LibraryContentStatus.Pending })];

  it('matches the search against a title', async () => {
    const page = await managerOver(new FakeContentRepository(rows), new FakeItemRepository([novel()])).list('novel-1', query({ search: 'paper' }));

    expect(page.items.map((row) => row.id)).toEqual(['b']);
  });

  it('matches the search against a filename', async () => {
    const assets = [asset({ id: 'a', filename: 'img_001.jpg' }), asset({ id: 'b', filename: 'clip_002.mp4' })];
    const page = await managerOver(new FakeContentRepository(assets), new FakeItemRepository([imageSet()])).list('image-1', query({ search: 'clip' }));

    expect(page.items.map((row) => row.id)).toEqual(['b']);
  });

  it('counts what matches, not what the page holds', async () => {
    const page = await managerOver(new FakeContentRepository(rows), new FakeItemRepository([novel()])).list('novel-1', query({ pageSize: 2 }));

    expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
  });

  it('leaves the status filter to the repository', async () => {
    const page = await managerOver(new FakeContentRepository(rows), new FakeItemRepository([novel()])).list('novel-1', query({ status: LibraryContentStatus.Pending }));

    expect(page.items.map((row) => row.id)).toEqual(['c']);
  });

  it('is a 404 for an item that is not there', async () => {
    const manager = managerOver(new FakeContentRepository(), new FakeItemRepository());

    await expect(manager.list('missing', query())).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryContentManager.chapters', () => {
  it('answers with every chapter of a novel', async () => {
    const contents = new FakeContentRepository([chapter({ id: 'a', index: 1 }), chapter({ id: 'b', index: 2 })]);
    const chapters = await managerOver(contents, new FakeItemRepository([novel()])).chapters('novel-1');

    expect(chapters.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('refuses a set, which has no chapters to scrape', async () => {
    const manager = managerOver(new FakeContentRepository([asset()]), new FakeItemRepository([imageSet()]));

    await expect(manager.chapters('image-1')).rejects.toThrow(NotImplementedException);
  });

  it('is a 404 for an item that is not there', async () => {
    await expect(managerOver(new FakeContentRepository(), new FakeItemRepository()).chapters('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('LibraryContentManager job writes', () => {
  it('marks the rows a job claimed pending, in one batch', async () => {
    const contents = new FakeContentRepository([chapter({ id: 'a' }), chapter({ id: 'b' })]);

    await managerOver(contents, new FakeItemRepository([novel()])).markQueued('novel-1', [{ id: 'a', index: 1 }, { id: 'b', index: 2 }]);

    expect(contents.statuses).toEqual([{ contentIds: ['a', 'b'], status: LibraryContentStatus.Pending }]);
  });

  it('writes the claimed rows to the live tree, each carrying its number', async () => {
    const contents = new FakeContentRepository([chapter({ id: 'a' }), chapter({ id: 'b' })]);
    const realtime = new FakeRealtimeProvider();

    await managerOver(contents, new FakeItemRepository([novel()]), realtime).markQueued('novel-1', [{ id: 'a', index: 1 }, { id: 'b', index: 2 }]);

    expect(realtime.queued).toEqual([
      { contentId: 'a', status: LibraryContentStatus.Pending, index: 1 },
      { contentId: 'b', status: LibraryContentStatus.Pending, index: 2 },
    ]);
  });

  it('is a 404 for an item that is not there, and marks nothing', async () => {
    const contents = new FakeContentRepository();

    await expect(managerOver(contents, new FakeItemRepository()).markQueued('missing', [{ id: 'a', index: 1 }])).rejects.toThrow(NotFoundException);
    expect(contents.statuses).toEqual([]);
  });

  it('moves one row in flight and nothing else', async () => {
    const contents = new FakeContentRepository([chapter()]);

    await managerOver(contents, new FakeItemRepository([novel()])).markScraping('novel-1', 'chapter-1');

    expect(contents.patches).toEqual([{ contentId: 'chapter-1', fields: { status: LibraryContentStatus.Scraping } }]);
  });

  it('points a completed row at what was stored, and recounts', async () => {
    const contents = new FakeContentRepository([chapter({ id: 'a', status: LibraryContentStatus.Scraping, contentUrl: null, words: 0 }), chapter({ id: 'b' })]);
    const items = new FakeItemRepository([novel()]);
    const counts = await managerOver(contents, items).completeScrape('novel-1', 'a', { contentUrl: TEXT_URL, words: 1841 });

    expect(contents.patches).toEqual([{ contentId: 'a', fields: { status: LibraryContentStatus.Completed, contentUrl: TEXT_URL, words: 1841 } }]);
    // Answered with what `recount` has just written, which is how a caller knows this was the last one.
    expect(counts).toMatchObject({ total: 2, completed: 2 });
    expect(items.counters).toEqual([{ itemId: 'novel-1', counters: { discoveredCount: 2, downloadedCount: 2, downloadedSize: undefined } }]);
  });

  it('moves a failed row status and leaves the text it already held', async () => {
    const contents = new FakeContentRepository([chapter({ contentUrl: TEXT_URL })]);

    await managerOver(contents, new FakeItemRepository([novel()])).markFailed('novel-1', 'chapter-1');

    expect(contents.patches).toEqual([{ contentId: 'chapter-1', fields: { status: LibraryContentStatus.Failed } }]);
    expect(contents.rows[0]).toMatchObject({ contentUrl: TEXT_URL });
  });
});

describe('LibraryContentManager.remove', () => {
  it('deletes a row that is there', async () => {
    const contents = new FakeContentRepository([chapter()]);

    await managerOver(contents, new FakeItemRepository([novel()])).remove('novel-1', 'chapter-1');

    expect(contents.removed).toEqual(['chapter-1']);
  });

  it('is a 404 for a row that is not, and deletes nothing', async () => {
    const contents = new FakeContentRepository();

    await expect(managerOver(contents, new FakeItemRepository([novel()])).remove('novel-1', 'missing')).rejects.toThrow(NotFoundException);
    expect(contents.removed).toEqual([]);
  });
});
