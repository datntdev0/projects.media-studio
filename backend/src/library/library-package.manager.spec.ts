// The manager's constructor names a repository, and that file reaches the Admin
// SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../core/config/app-config.service';
import { ArchiveProvider, ArchiveWriter } from '../core/providers/archive.provider';
import { ContentLanguages, LibraryContentStatus, LibraryContentType, TextContent } from './entities/library-content.entity';
import { LibraryItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelStatus } from './entities/library-item.entity';
import { PackageManifest, PackagedContent } from './entities/library-package.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryPackageManager } from './library-package.manager';
import { LibraryRepository } from './library.repository';

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

  path = '';

  filename = '';

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

  /** One entry by name, so an assertion names what it is looking for. */
  entry(name: string): Written | undefined {
    return this.written.find((one) => one.name === name);
  }

  json<T>(name: string): T {
    return JSON.parse(this.entry(name)?.body ?? 'null') as T;
  }

  private append(one: Written): Promise<void> {
    this.written.push(one);

    return Promise.resolve();
  }
}

function chapter(over: Partial<TextContent> = {}): TextContent {
  return {
    id: 'ch-1',
    idx: 1,
    type: LibraryContentType.Original,
    status: LibraryContentStatus.Completed,
    sourceUrl: 'https://www.novel543.com/0612559073/8096_1.html',
    contentUrl: bodyUrl('one'),
    language: ContentLanguages.English,
    title: 'Nine Bells for the Harbour',
    words: 1200,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function novel(over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'novel-1',
    type: LibraryItemType.Novel,
    title: 'The Silent Cartographer',
    coverUrl: null,
    sourceMode: LibrarySourceMode.Crawler,
    sourceName: 'novel543',
    sourceUrl: 'https://www.novel543.com/0612559073',
    status: LibraryItemStatus.Ready,
    novelMetadata: { discoveredCount: 3, discoveredAt: NOW, downloadedCount: 2, status: NovelStatus.Ongoing, author: 'A. Cartographer', language: 'en', genres: ['fantasy'], description: 'A coast that moves.' },
    imageMetadata: null,
    videoMetadata: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const imageSet = (): LibraryItem => ({
  id: 'set-1',
  type: LibraryItemType.Image,
  title: 'Plates',
  coverUrl: null,
  sourceMode: LibrarySourceMode.Manual,
  sourceName: 'Manual',
  sourceUrl: null,
  status: LibraryItemStatus.Ready,
  novelMetadata: null,
  imageMetadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, downloadedSize: 0 },
  videoMetadata: null,
  createdAt: NOW,
  updatedAt: NOW,
});

interface Fixture {
  item?: LibraryItem | null;
  originals?: TextContent[];
  translations?: TextContent[];
}

function managerOver({ item = novel(), originals = [], translations = [] }: Fixture) {
  const archive = new FakeArchive();

  const repository = { findLibrary: () => Promise.resolve(item) } as unknown as LibraryRepository;
  const contents = {
    chapters: () => Promise.resolve(originals),
    translations: () => Promise.resolve(translations),
  } as unknown as LibraryContentManager;

  const config = { firebase: { projectId: 'media-studio-dev' } } as AppConfigService;

  return { archive, manager: new LibraryPackageManager(repository, contents, archive as unknown as ArchiveProvider, config) };
}

describe('LibraryPackageManager', () => {
  it('packs the manifest, the item, the records and one entry per body, filed at one path per item', async () => {
    const originals = [chapter(), chapter({ id: 'ch-2', idx: 2, contentUrl: bodyUrl('two') })];
    const { archive, manager } = managerOver({ originals });

    const answer = await manager.export('novel-1');

    expect(archive.path).toBe('packages/novel-1.zip');
    expect(archive.written.map((one) => one.name)).toEqual(['manifest.json', 'item.json', 'contents.json', 'contents/original/0001.txt', 'contents/original/0002.txt']);
    expect(archive.entry('contents/original/0002.txt')).toMatchObject({ kind: 'object', body: 'content/novel-1/two.txt' });
    expect(answer).toMatchObject({ contents: 2, bodies: 2, bytes: 4096, filename: 'the-silent-cartographer-export.zip' });
  });

  it('states its own schema, project and counts in the manifest', async () => {
    const { archive, manager } = managerOver({ originals: [chapter()] });

    await manager.export('novel-1');

    expect(archive.json<PackageManifest>('manifest.json')).toMatchObject({
      schema: 1,
      kind: LibraryItemType.Novel,
      project: 'media-studio-dev',
      source: { itemId: 'novel-1', title: 'The Silent Cartographer' },
      counts: { contents: 1, bodies: 1, translations: { vi: 0, en: 0, zh: 0 } },
    });
  });

  // A discovered chapter nobody has scraped is still worth carrying: its number and
  // its title are most of what discovery produced.
  it('carries a chapter with no text as a record with no file', async () => {
    const originals = [chapter({ contentUrl: null, status: LibraryContentStatus.Discovered }), chapter({ id: 'ch-2', idx: 2, contentUrl: bodyUrl('two') })];
    const { archive, manager } = managerOver({ originals });

    const answer = await manager.export('novel-1');

    expect(archive.json<PackagedContent[]>('contents.json').map((record) => record.file)).toEqual([null, 'contents/original/0002.txt']);
    expect(archive.written.filter((one) => one.kind === 'object')).toHaveLength(1);
    expect(answer).toMatchObject({ contents: 2, bodies: 1 });
  });

  it('writes translation rows and bodies under their own language, and reports coverage for every language', async () => {
    const originals = [chapter(), chapter({ id: 'ch-2', idx: 2, contentUrl: bodyUrl('two') })];
    const translations = [chapter({ id: 'tr-2', idx: 2, type: LibraryContentType.Translation, language: ContentLanguages.Vietnamese, title: 'Chương hai', contentUrl: bodyUrl('two-vi') })];
    const { archive, manager } = managerOver({ originals, translations });

    const answer = await manager.export('novel-1');

    expect(archive.json<PackagedContent[]>('contents.json').map((record) => record.file)).toContain('contents/translation/vi/0001.txt');
    expect(archive.entry('contents/translation/vi/0001.txt')).toMatchObject({ kind: 'object', body: 'content/novel-1/two-vi.txt' });
    expect(answer.translations).toEqual({ vi: 1, en: 0, zh: 0 });
  });

  it('packs the cover as it is, and leaves it out where there is none', async () => {
    const { archive, manager } = managerOver({ item: novel({ coverUrl: COVER_URL }) });

    await manager.export('novel-1');

    expect(archive.entry('cover.jpg')).toMatchObject({ kind: 'image', body: 'covers/novel-1/front.jpg' });

    const { archive: bare, manager: bareManager } = managerOver({});

    await bareManager.export('novel-1');

    expect(bare.written.map((one) => one.name)).not.toContain('cover.jpg');
  });

  it('writes the item as a create body, so an import can hand it straight over', async () => {
    const { archive, manager } = managerOver({});

    await manager.export('novel-1');

    expect(archive.json('item.json')).toEqual({
      type: LibraryItemType.Novel,
      title: 'The Silent Cartographer',
      status: LibraryItemStatus.Ready,
      sourceMode: LibrarySourceMode.Crawler,
      sourceName: 'novel543',
      sourceUrl: 'https://www.novel543.com/0612559073',
      coverUrl: null,
      novelMetadata: { discoveredCount: 3, discoveredAt: NOW, downloadedCount: 2, status: NovelStatus.Ongoing, author: 'A. Cartographer', language: 'en', genres: ['fantasy'], description: 'A coast that moves.' },
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
