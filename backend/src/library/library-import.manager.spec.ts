// The manager's constructor names a repository, and that file reaches the Admin
// SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ArchiveEntry, ArchiveProvider } from '../core/providers/archive.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { LibraryImportRequested, QueueTopic } from '../core/queues/queue.messages';
import { QueueProducer } from '../core/queues/queue.producer';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { LibraryPackageReportDto } from './dto/library-package.dto';
import { LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { ImageSetItem, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { ImportConflict, PackageCheckState } from './entities/library-package.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryImportManager } from './library-import.manager';
import { LibraryImportWriter } from './library-import.writer';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const PACKAGE_URL = 'https://storage.example.com/v0/b/demo.firebasestorage.app/o/packages%2Fnovel-1%2Fa.zip?alt=media&token=t';

const MANIFEST = { schema: 1, kind: 'novel', exportedAt: '2026-08-12T10:00:00.000Z', project: 'media-studio-dev', source: { itemId: 'novel-1', title: 'The Silent Cartographer' }, counts: { chapters: 2, bodies: 2, translations: {} } };

const ITEM = { type: 'novel', title: 'The Silent Cartographer', coverUrl: null, sourceMode: 'crawler', sourceName: 'novel543', sourceUrl: 'https://www.novel543.com/0612559073' };

const record = (index: number, file: string | null = `chapters/000${index}.txt`) => ({ index, title: `Chapter ${index}`, language: 'en', words: 100, sourceUrl: null, file });

/** An archive as a map of entry names to bodies — which is all the first pass reads. */
class FakeArchive {
  /** Every name the pass asked about, and whether it took it. Pins what a body costs. */
  asked: { name: string, taken: boolean }[] = [];

  removed: string[] = [];

  constructor(public entries: Record<string, unknown> = {}) {}

  remove(path: string): Promise<void> {
    this.removed.push(path);

    return Promise.resolve();
  }

  readFrom(_path: string, wanted: (name: string) => boolean, onEntry: ArchiveEntry): Promise<void> {
    return Object.entries(this.entries).reduce(async (before, [name, body]) => {
      await before;

      const taken = wanted(name);

      this.asked.push({ name, taken });

      if (taken) {
        await onEntry(name, Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8'));
      }
    }, Promise.resolve());
  }
}

/** The two records files plus two bodies — a package that should read clean. */
function archive(over: Record<string, unknown> = {}): FakeArchive {
  return new FakeArchive({
    'manifest.json': MANIFEST,
    'item.json': ITEM,
    'chapters.json': [record(1), record(2)],
    'chapters/0001.txt': 'Chapter one.',
    'chapters/0002.txt': 'Chapter two.',
    ...over,
  });
}

function chapter(index: number): NovelChapter {
  return {
    id: `ch-${index}`,
    type: LibraryItemType.Novel,
    index,
    title: `Chapter ${index}`,
    language: 'en',
    words: 100,
    sourceUrl: null,
    contentUrl: null,
    status: LibraryContentStatus.Discovered,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function novel(over: Partial<NovelItem> = {}): NovelItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: 'novel543',
    sourceUrl: 'https://www.novel543.com/0612559073',
    status: LibraryItemStatus.Ready,
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: 'en', genres: [], description: '' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const imageSet = (): ImageSetItem => ({ ...novel(), id: 'set-1', type: LibraryItemType.Image, metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 } });

/** What the endpoint half of the manager reaches for, and what each call recorded. */
class Around {
  sent: LibraryImportRequested[] = [];

  created: CreateLibraryItemDto[] = [];

  ran: { itemId: string, onConflict: ImportConflict }[] = [];

  running: string | null = null;

  failed: { itemId: string, error?: string }[] = [];

  /** Set to make the writer throw, for the case where a pass dies half-way. */
  breaks: Error | null = null;

  readonly library = { create: (input: CreateLibraryItemDto) => { this.created.push(input); return Promise.resolve({ id: 'novel-2' }); } };

  readonly writer = {
    run: (item: { id: string }, _path: string, _records: unknown, onConflict: ImportConflict) => {
      this.ran.push({ itemId: item.id, onConflict });

      return this.breaks ? Promise.reject(this.breaks) : Promise.resolve({ added: 1, overwritten: 0, skipped: 0, translated: 0 });
    },
  };

  readonly realtime = {
    runningImport: () => Promise.resolve(this.running ? { itemId: this.running, status: 'running' } : null),
    publishImport: (snapshot: { itemId: string, status?: string, error?: string }) => {
      if (snapshot.status === 'failed') {
        this.failed.push({ itemId: snapshot.itemId, error: snapshot.error });
      }

      return Promise.resolve();
    },
  };

  readonly queue = { send: (_topic: QueueTopic, payload: LibraryImportRequested) => { this.sent.push(payload); return Promise.resolve(); } };
}

function managerOver(packaged: FakeArchive, item: LibraryItem | null = novel(), chapters: NovelChapter[] = [], around = new Around()) {
  const items = { findById: () => Promise.resolve(item) } as unknown as LibraryRepository;
  const contents = { chapters: () => Promise.resolve(chapters) } as unknown as LibraryContentManager;

  return new LibraryImportManager(
    items,
    around.library as unknown as LibraryManager,
    contents,
    around.writer as unknown as LibraryImportWriter,
    packaged as unknown as ArchiveProvider,
    around.realtime as unknown as RealtimeProvider,
    around.queue as unknown as QueueProducer,
  );
}

/** One check by the label it starts with, so an assertion names what it is looking for. */
const check = (report: LibraryPackageReportDto, starting: string) => report.checks.find(one => one.label.startsWith(starting));

describe('LibraryImportManager.validate', () => {
  it('reads a clean package and counts what it would add', async () => {
    const report = await managerOver(archive(), novel(), [chapter(1)]).validate('novel-1', PACKAGE_URL);

    expect(report).toMatchObject({ valid: true, chapters: 2, adding: 1, existing: 1, skipped: [] });
    expect(check(report, 'manifest.json')).toEqual({ state: PackageCheckState.Pass, label: 'manifest.json · schema v1', detail: 'Exported 12 Aug 2026 from project media-studio-dev' });
    expect(check(report, '2 chapter files')).toMatchObject({ state: PackageCheckState.Pass, detail: '1 new · 1 matched, for the conflict policy to decide' });
    expect(check(report, 'Metadata record')).toMatchObject({ state: PackageCheckState.Pass, detail: 'Title, author, genres · matches this item' });
  });

  // The whole reason validation is cheap enough to run twice — once for the person,
  // once for the endpoint that will not take their word for it.
  it('never decompresses a body', async () => {
    const packaged = archive();

    await managerOver(packaged).validate('novel-1', PACKAGE_URL);

    expect(packaged.asked.filter(one => one.taken).map(one => one.name)).toEqual(['manifest.json', 'item.json', 'chapters.json']);
  });

  it('fails a package written by a later workspace', async () => {
    const report = await managerOver(archive({ 'manifest.json': { ...MANIFEST, schema: 2 } })).validate('novel-1', PACKAGE_URL);

    expect(report.valid).toBe(false);
    expect(check(report, 'manifest.json')).toMatchObject({ state: PackageCheckState.Fail, label: 'manifest.json · schema v2' });
  });

  it('fails a package that holds a set', async () => {
    const report = await managerOver(archive({ 'manifest.json': { ...MANIFEST, kind: 'image' } })).validate('novel-1', PACKAGE_URL);

    expect(report.valid).toBe(false);
    expect(check(report, 'manifest.json')?.detail).toContain('image set');
  });

  it('fails a package missing either records file', async () => {
    const noItem = archive();
    const noChapters = archive();

    delete noItem.entries['item.json'];
    delete noChapters.entries['chapters.json'];

    await expect(managerOver(noItem).validate('novel-1', PACKAGE_URL)).resolves.toMatchObject({ valid: false });
    await expect(managerOver(noChapters).validate('novel-1', PACKAGE_URL)).resolves.toMatchObject({ valid: false, chapters: 0 });
  });

  // A re-exported item that has since been renamed must stay importable into itself,
  // and "Import as new library item" exists for a package that matches nothing.
  it('warns about a package describing another book, and lets it through', async () => {
    const report = await managerOver(archive({ 'item.json': { ...ITEM, title: 'Another Book' } })).validate('novel-1', PACKAGE_URL);

    expect(report.valid).toBe(true);
    expect(check(report, 'Metadata record')).toMatchObject({ state: PackageCheckState.Warn, detail: 'Describes “Another Book” — this item is “The Silent Cartographer”' });
  });

  it('names what it skipped, and says the cover was there', async () => {
    const report = await managerOver(archive({ 'notes.pdf': 'x', 'chapter_507.docx': 'x', 'cover.jpg': 'x' })).validate('novel-1', PACKAGE_URL);

    expect(report.skipped).toEqual(['notes.pdf', 'chapter_507.docx']);
    expect(check(report, '2 files skipped')).toMatchObject({ state: PackageCheckState.Warn, detail: 'notes.pdf, chapter_507.docx — not part of the format' });
    expect(check(report, 'Metadata record')?.detail).toBe('Title, author, genres, cover · matches this item');
  });

  it('lists one row per language the package carries', async () => {
    const report = await managerOver(archive({ 'translations/vi.json': [record(1, 'translations/vi/0001.txt')], 'translations/vi/0001.txt': 'Chương một' })).validate('novel-1', PACKAGE_URL);

    expect(report.translations).toEqual([{ language: 'vi', translated: 1 }]);
    expect(check(report, 'Translations · Vietnamese')).toMatchObject({ state: PackageCheckState.Pass, detail: '1 chapter' });
  });

  it('refuses a package it cannot read a manifest out of', async () => {
    const broken = archive({ 'manifest.json': 'not json' });

    await expect(managerOver(broken).validate('novel-1', PACKAGE_URL)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a URL that is not an object in this bucket, before opening anything', async () => {
    const packaged = archive();

    await expect(managerOver(packaged).validate('novel-1', 'https://example.com/somewhere.zip')).rejects.toBeInstanceOf(BadRequestException);
    expect(packaged.asked).toHaveLength(0);
  });

  it('refuses a set, and an item that is not there', async () => {
    await expect(managerOver(archive(), imageSet()).validate('set-1', PACKAGE_URL)).rejects.toBeInstanceOf(BadRequestException);
    await expect(managerOver(archive(), null).validate('nope', PACKAGE_URL)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LibraryImportManager.start', () => {
  const skip = { packageUrl: PACKAGE_URL, onConflict: ImportConflict.Skip };

  it('queues one message for the whole package and answers with what it will write', async () => {
    const around = new Around();

    const answer = await managerOver(archive(), novel(), [], around).start('novel-1', skip);

    expect(answer).toEqual({ itemId: 'novel-1', total: 2 });
    expect(around.sent).toEqual([{ itemId: 'novel-1', packageUrl: PACKAGE_URL, onConflict: ImportConflict.Skip }]);
  });

  // An endpoint that trusts a client to have asked a question is one that can be
  // asked not to.
  it('validates for itself, and queues nothing when the package fails', async () => {
    const around = new Around();
    const later = archive({ 'manifest.json': { ...MANIFEST, schema: 2 } });

    await expect(managerOver(later, novel(), [], around).start('novel-1', skip)).rejects.toBeInstanceOf(BadRequestException);
    expect(around.sent).toHaveLength(0);
  });

  it('refuses a second import while one is running', async () => {
    const around = new Around();

    around.running = 'novel-1';

    await expect(managerOver(archive(), novel(), [], around).start('novel-1', skip)).rejects.toBeInstanceOf(ConflictException);
    expect(around.sent).toHaveLength(0);
  });

  it('creates the item a new-item import goes into, and names it on the answer', async () => {
    const around = new Around();

    const answer = await managerOver(archive(), novel(), [], around).start('novel-1', { packageUrl: PACKAGE_URL, onConflict: ImportConflict.NewItem });

    expect(around.created).toEqual([{ ...ITEM, type: LibraryItemType.Novel }]);
    expect(answer.itemId).toBe('novel-2');
    expect(around.sent[0]?.itemId).toBe('novel-2');
  });

  // A refused request must not leave a stray item behind, so the running check comes
  // first — and a brand new item cannot have an import running over it anyway.
  it('makes no item when the package fails validation', async () => {
    const around = new Around();
    const later = archive({ 'manifest.json': { ...MANIFEST, schema: 2 } });

    await expect(managerOver(later, novel(), [], around).start('novel-1', { packageUrl: PACKAGE_URL, onConflict: ImportConflict.NewItem })).rejects.toBeInstanceOf(BadRequestException);
    expect(around.created).toHaveLength(0);
  });
});

describe('LibraryImportManager.run', () => {
  it('unpacks the package and then drops it', async () => {
    const around = new Around();
    const packaged = archive();

    await managerOver(packaged, novel(), [], around).run('novel-1', PACKAGE_URL, ImportConflict.Overwrite);

    expect(around.ran).toEqual([{ itemId: 'novel-1', onConflict: ImportConflict.Overwrite }]);
    expect(packaged.removed).toEqual(['packages/novel-1/a.zip']);
  });

  // Left behind on purpose: a failed import is re-run by pressing Import again, and
  // the retry needs something to read.
  it('says why it failed, keeps the package, and lets the queue see the throw', async () => {
    const around = new Around();
    const packaged = archive();

    around.breaks = new Error('Storage is down');

    await expect(managerOver(packaged, novel(), [], around).run('novel-1', PACKAGE_URL, ImportConflict.Skip)).rejects.toThrow('Storage is down');
    expect(around.failed).toEqual([{ itemId: 'novel-1', error: 'Storage is down' }]);
    expect(packaged.removed).toHaveLength(0);
  });
});
