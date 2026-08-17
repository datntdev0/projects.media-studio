// The manager's constructor names a repository, and that file reaches the Admin
// SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ArchiveEntry, ArchiveProvider } from '../core/providers/archive.provider';
import { LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { ImageSetItem, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { PackageCheckState } from './entities/library-package.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryImportManager } from './library-import.manager';
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

  constructor(public entries: Record<string, unknown> = {}) {}

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

function managerOver(packaged: FakeArchive, item: LibraryItem | null = novel(), chapters: NovelChapter[] = []) {
  const items = { findById: () => Promise.resolve(item) } as unknown as LibraryRepository;
  const contents = { chapters: () => Promise.resolve(chapters) } as unknown as LibraryContentManager;

  return new LibraryImportManager(items, contents, packaged as unknown as ArchiveProvider);
}

/** One check by the label it starts with, so an assertion names what it is looking for. */
const check = (report: { checks: { label: string }[] }, starting: string) => report.checks.find(one => one.label.startsWith(starting));

describe('LibraryImportManager.validate', () => {
  it('reads a clean package and counts what it would add', async () => {
    const report = await managerOver(archive(), novel(), [chapter(1)]).validate('novel-1', PACKAGE_URL);

    expect(report).toMatchObject({ valid: true, chapters: 2, adding: 1, existing: 1, skipped: [] });
    expect(check(report, 'manifest.json')).toEqual({ state: PackageCheckState.Pass, label: 'manifest.json · schema v1', detail: 'Exported 12 Aug 2026 from project media-studio-dev' });
    expect(check(report, '2 chapter files')).toMatchObject({ state: PackageCheckState.Pass, detail: '1 not present in this item · 1 already stored' });
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
