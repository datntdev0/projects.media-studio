// The manager's constructor names a repository, and that file reaches the Admin
// SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';
import { ArchiveProvider, ArchiveWriter } from '../core/providers/archive.provider';
import { LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { ImageSetItem, LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { PackageManifest, PackagedChapter } from './entities/library-package.entity';
import { TRANSLATION_LANGUAGES, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryExportManager } from './library-export.manager';
import { LibraryTranslationRepository } from './library-translation.repository';
import { LibraryItemRepository } from './library-item.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const BUCKET = 'https://storage.example.com/v0/b/demo.firebasestorage.app/o';

const bodyUrl = (name: string): string => `${BUCKET}/${encodeURIComponent(`content/novel-1/${name}.txt`)}?alt=media&token=t`;

const COVER_URL = `${BUCKET}/${encodeURIComponent('covers/novel-1/front.jpg')}?alt=media&token=t`;

/** One entry as it was appended: what it is called, how it was packed, and what went in. */
interface Written {
  name: string;
  kind: 'text' | 'object' | 'image';
  body: string;
}

class FakeArchive {
  written: Written[] = [];

  writeTo(path: string, filename: string, build: (into: ArchiveWriter) => Promise<void>) {
    this.path = path;
    this.filename = filename;

    const into: ArchiveWriter = {
      text: (name, body) => this.append({ name, kind: 'text', body }),
      object: (name, from) => this.append({ name, kind: 'object', body: from }),
      image: (name, from) => this.append({ name, kind: 'image', body: from }),
    };

    return build(into).then(() => ({ url: `${BUCKET}/package.zip`, bytes: 4096 }));
  }

  path = '';

  filename = '';

  /** One entry by name, so an assertion names what it is looking for. */
  entry(name: string): Written | undefined {
    return this.written.find(one => one.name === name);
  }

  json<T>(name: string): T {
    return JSON.parse(this.entry(name)?.body ?? 'null') as T;
  }

  private append(one: Written): Promise<void> {
    this.written.push(one);

    return Promise.resolve();
  }
}

function chapter(over: Partial<NovelChapter> = {}): NovelChapter {
  return {
    id: 'ch-1',
    type: LibraryItemType.Novel,
    index: 1,
    title: 'Nine Bells for the Harbour',
    language: 'en',
    words: 1200,
    sourceUrl: 'https://www.novel543.com/0612559073/8096_1.html',
    contentUrl: bodyUrl('one'),
    status: LibraryContentStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
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
    metadata: { discoveredCount: 3, discoveredAt: NOW, downloadedCount: 2, status: NovelStatus.Ongoing, author: 'A. Cartographer', language: 'en', genres: ['fantasy'], description: 'A coast that moves.' },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const imageSet = (): ImageSetItem => ({
  id: 'set-1',
  type: LibraryItemType.Image,
  title: 'Plates',
  coverUrl: null,
  sourceMode: LibrarySourceMode.Manual,
  sourceName: 'Manual',
  sourceUrl: null,
  status: LibraryItemStatus.Ready,
  metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 },
  createdAt: NOW,
  updatedAt: NOW,
});

interface Fixture {
  item?: LibraryItem | null;
  chapters?: NovelChapter[];
  translations?: Partial<Record<TranslationLanguage, NovelChapter[]>>;
}

function managerOver({ item = novel(), chapters = [], translations = {} }: Fixture) {
  const archive = new FakeArchive();

  const items = { findById: () => Promise.resolve(item) } as unknown as LibraryItemRepository;
  const contents = { chapters: () => Promise.resolve(chapters) } as unknown as LibraryContentManager;

  const stored = {
    counts: () => Promise.resolve(Object.fromEntries(TRANSLATION_LANGUAGES.map(language => [language, (translations[language] ?? []).length])) as Record<TranslationLanguage, number>),
    findByIds: (_itemId: string, language: TranslationLanguage, contentIds: string[]) =>
      Promise.resolve(new Map((translations[language] ?? []).filter(row => contentIds.includes(row.id)).map(row => [row.id, row]))),
  } as unknown as LibraryTranslationRepository;

  const config = { firebase: { projectId: 'media-studio-dev' } } as AppConfigService;

  return { archive, manager: new LibraryExportManager(items, contents, stored, archive as unknown as ArchiveProvider, config) };
}

describe('LibraryExportManager', () => {
  it('packs the manifest, the item, the records and one entry per body', async () => {
    const chapters = [chapter(), chapter({ id: 'ch-2', index: 2, contentUrl: bodyUrl('two') })];
    const { archive, manager } = managerOver({ chapters });

    const answer = await manager.export('novel-1');

    expect(archive.written.map(one => one.name)).toEqual(['manifest.json', 'item.json', 'chapters.json', 'chapters/0001.txt', 'chapters/0002.txt']);
    expect(archive.entry('chapters/0002.txt')).toMatchObject({ kind: 'object', body: 'content/novel-1/two.txt' });
    expect(answer).toMatchObject({ chapters: 2, bodies: 2, bytes: 4096, filename: 'the-silent-cartographer-export.zip' });
  });

  it('states its own schema, project and counts in the manifest', async () => {
    const { archive, manager } = managerOver({ chapters: [chapter()] });

    await manager.export('novel-1');

    expect(archive.json<PackageManifest>('manifest.json')).toMatchObject({
      schema: 1,
      kind: LibraryItemType.Novel,
      project: 'media-studio-dev',
      source: { itemId: 'novel-1', title: 'The Silent Cartographer' },
      counts: { chapters: 1, bodies: 1, translations: {} },
    });
  });

  // A discovered chapter nobody has scraped is still worth carrying: its number and
  // its title are most of what discovery produced.
  it('carries a chapter with no text as a record with no file', async () => {
    const chapters = [chapter({ contentUrl: null, status: LibraryContentStatus.Discovered }), chapter({ id: 'ch-2', index: 2, contentUrl: bodyUrl('two') })];
    const { archive, manager } = managerOver({ chapters });

    const answer = await manager.export('novel-1');

    expect(archive.json<PackagedChapter[]>('chapters.json').map(record => record.file)).toEqual([null, 'chapters/0002.txt']);
    expect(archive.written.filter(one => one.kind === 'object')).toHaveLength(1);
    expect(answer).toMatchObject({ chapters: 2, bodies: 1 });
  });

  it('writes a records file and a folder only for a language that holds something', async () => {
    const chapters = [chapter(), chapter({ id: 'ch-2', index: 2, contentUrl: bodyUrl('two') })];
    const translations = { [TranslationLanguage.Vietnamese]: [chapter({ id: 'ch-2', index: 2, title: 'Chương hai', contentUrl: bodyUrl('two-vi') })] };
    const { archive, manager } = managerOver({ chapters, translations });

    const answer = await manager.export('novel-1');

    expect(archive.written.map(one => one.name)).toContain('translations/vi.json');
    expect(archive.written.map(one => one.name)).not.toContain('translations/en.json');
    expect(archive.entry('translations/vi/0001.txt')).toMatchObject({ kind: 'object', body: 'content/novel-1/two-vi.txt' });
    // All three rows on the answer, zeroes included — part 4's rule for coverage.
    expect(answer.translations).toEqual([
      { language: TranslationLanguage.Vietnamese, translated: 1 },
      { language: TranslationLanguage.English, translated: 0 },
      { language: TranslationLanguage.Chinese, translated: 0 },
    ]);
  });

  // The source's number, not the translation document's stored copy: part 4 answers
  // with the source's `index` on every read, and a package should say what a read says.
  it("numbers a translation record with its source chapter's index", async () => {
    const chapters = [chapter({ id: 'ch-9', index: 9 })];
    const translations = { [TranslationLanguage.Vietnamese]: [chapter({ id: 'ch-9', index: 1, title: 'Chương chín' })] };
    const { archive, manager } = managerOver({ chapters, translations });

    await manager.export('novel-1');

    expect(archive.json<PackagedChapter[]>('translations/vi.json')).toEqual([
      { index: 9, title: 'Chương chín', language: 'en', words: 1200, sourceUrl: chapters[0].sourceUrl, file: 'translations/vi/0001.txt' },
    ]);
  });

  it('packs the cover as it is, and leaves it out where there is none', async () => {
    const { archive, manager } = managerOver({ item: novel({ coverUrl: COVER_URL }) });

    await manager.export('novel-1');

    expect(archive.entry('cover.jpg')).toMatchObject({ kind: 'image', body: 'covers/novel-1/front.jpg' });

    const { archive: bare, manager: bareManager } = managerOver({});

    await bareManager.export('novel-1');

    expect(bare.written.map(one => one.name)).not.toContain('cover.jpg');
  });

  it('writes the item as a create body, so an import can hand it straight over', async () => {
    const { archive, manager } = managerOver({});

    await manager.export('novel-1');

    expect(archive.json('item.json')).toEqual({
      type: LibraryItemType.Novel,
      title: 'The Silent Cartographer',
      coverUrl: null,
      sourceMode: LibrarySourceMode.Crawler,
      sourceName: 'novel543',
      sourceUrl: 'https://www.novel543.com/0612559073',
      metadata: { discoveredCount: 3, discoveredAt: NOW, status: NovelStatus.Ongoing, author: 'A. Cartographer', language: 'en', genres: ['fantasy'], description: 'A coast that moves.' },
    });
  });

  // A title with nothing latin in it slugs to nothing, and a file called `-export.zip`
  // is not a filename.
  it('falls back to the id where a title slugs to nothing', async () => {
    const { manager } = managerOver({ item: novel({ title: '劍來' }) });

    await expect(manager.export('novel-1')).resolves.toMatchObject({ filename: 'novel-1-export.zip' });
  });

  it('refuses a set, and an item that is not there', async () => {
    const { archive, manager } = managerOver({ item: imageSet() });

    await expect(manager.export('set-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(archive.written).toHaveLength(0);

    const { manager: missing } = managerOver({ item: null });

    await expect(missing.export('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
