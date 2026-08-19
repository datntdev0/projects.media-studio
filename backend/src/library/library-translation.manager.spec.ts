// The manager's constructor names a repository, and that file reaches the Admin
// SDK — where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot
// require. Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { BadRequestException } from '@nestjs/common';
import { ImageAsset, LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { ImageSetItem, LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { TRANSLATION_LANGUAGES, TranslationLanguage } from './entities/library-translation.entity';
import { LibraryTranslationManager } from './library-translation.manager';
import { LibraryTranslationRepository, TranslationDraft } from './library-translation.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const LATER = '2026-08-17T14:30:00.000Z';

const TEXT_URL = 'https://storage.example.com/content/novel-1/ch412.txt';

const VI_URL = 'https://storage.example.com/content/novel-1/ch412-vi.txt';

const CHAPTER_URL = 'https://www.novel543.com/0612559073/8096_3.html';

/** The three subcollections, by hand — stamping their dates the way the real repository does. */
class FakeTranslationRepository {
  /** Every lookup, in order. What pins that a page of rows costs one of them. */
  lookups: { language: TranslationLanguage, contentIds: string[] }[] = [];

  removed: string[] = [];

  cleared: string[] = [];

  constructor(public rows: Partial<Record<TranslationLanguage, NovelChapter[]>> = {}) {}

  findByIds(itemId: string, language: TranslationLanguage, contentIds: string[]): Promise<Map<string, NovelChapter>> {
    this.lookups.push({ language, contentIds });

    const stored = this.rows[language] ?? [];

    return Promise.resolve(new Map(stored.filter((row) => contentIds.includes(row.id)).map((row) => [row.id, row])));
  }

  upsert(itemId: string, language: TranslationLanguage, contentId: string, draft: TranslationDraft): Promise<NovelChapter> {
    const stored = this.rows[language] ?? [];
    const existing = stored.find((row) => row.id === contentId);
    const written: NovelChapter = { ...draft, id: contentId, createdAt: existing?.createdAt ?? LATER, updatedAt: LATER };

    this.rows[language] = [...stored.filter((row) => row.id !== contentId), written];

    return Promise.resolve(written);
  }

  remove(itemId: string, contentId: string): Promise<void> {
    this.removed.push(contentId);

    return Promise.resolve();
  }

  removeAll(itemId: string): Promise<void> {
    this.cleared.push(itemId);

    return Promise.resolve();
  }

  counts(): Promise<Record<TranslationLanguage, number>> {
    const counted = TRANSLATION_LANGUAGES.map((language) => [language, (this.rows[language] ?? []).length] as const);

    return Promise.resolve(Object.fromEntries(counted) as Record<TranslationLanguage, number>);
  }
}

function managerOver(repository: FakeTranslationRepository): LibraryTranslationManager {
  return new LibraryTranslationManager(repository as unknown as LibraryTranslationRepository);
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
    metadata: { discoveredCount: 0, discoveredAt: null, downloadedCount: 0, status: NovelStatus.Ongoing, author: '', language: 'zh', genres: [], description: '' },
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
    language: 'Chinese',
    words: 2744,
    sourceUrl: CHAPTER_URL,
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
    contentUrl: null,
    status: LibraryContentStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** A stored Vietnamese translation of the chapter named, as `save` would have written it. */
function translation(over: Partial<NovelChapter> = {}): NovelChapter {
  return chapter({
    title: 'Chín hồi chuông cho bến cảng',
    language: TranslationLanguage.Vietnamese,
    words: 1980,
    contentUrl: VI_URL,
    createdAt: LATER,
    updatedAt: LATER,
    ...over,
  });
}

describe('LibraryTranslationManager.decorate', () => {
  it('folds a stored translation over the row it translates', async () => {
    const repository = new FakeTranslationRepository({ vi: [translation()] });
    const [row] = await managerOver(repository).decorate(novel(), TranslationLanguage.Vietnamese, [chapter()]);

    expect(row).toMatchObject({
      title: 'Chín hồi chuông cho bến cảng',
      words: 1980,
      contentUrl: VI_URL,
      translated: true,
      sourceTitle: 'Nine Bells for the Harbour',
    });
  });

  it('reads the chapter, not the text of it, from the source', async () => {
    // The stored translation carries a stale copy of all three, which is exactly
    // what the merge exists to ignore.
    const stale = translation({ index: 1, status: LibraryContentStatus.Pending, sourceUrl: null });
    const source = chapter({ index: 412, status: LibraryContentStatus.Failed, sourceUrl: CHAPTER_URL });
    const [row] = await managerOver(new FakeTranslationRepository({ vi: [stale] })).decorate(novel(), TranslationLanguage.Vietnamese, [source]);

    expect(row).toMatchObject({ index: 412, status: LibraryContentStatus.Failed, sourceUrl: CHAPTER_URL });
  });

  it('falls back to the source where nothing is translated', async () => {
    const [row] = await managerOver(new FakeTranslationRepository()).decorate(novel(), TranslationLanguage.Vietnamese, [chapter()]);

    expect(row).toMatchObject({ title: 'Nine Bells for the Harbour', translated: false, sourceTitle: null });
  });

  it('reads a page in one lookup, whatever it holds', async () => {
    const rows = Array.from({ length: 10 }, (_, at) => chapter({ id: `chapter-${at}`, index: at + 1 }));
    const stored = [0, 4, 9].map((at) => translation({ id: `chapter-${at}`, title: `Chương ${at}` }));
    const repository = new FakeTranslationRepository({ vi: stored });

    const decorated = await managerOver(repository).decorate(novel(), TranslationLanguage.Vietnamese, rows);

    expect(repository.lookups).toHaveLength(1);
    expect(repository.lookups[0]?.contentIds).toHaveLength(10);
    expect(decorated.filter((row) => row.translated)).toHaveLength(3);
    expect(decorated.filter((row) => !row.translated)).toHaveLength(7);
  });

  it('touches nothing when no language is asked for', async () => {
    const repository = new FakeTranslationRepository({ vi: [translation()] });
    const [row] = await managerOver(repository).decorate(novel(), undefined, [chapter()]);

    expect(repository.lookups).toHaveLength(0);
    expect(row).toMatchObject({ title: 'Nine Bells for the Harbour', translated: false, sourceTitle: null });
  });

  it('refuses a language on a set, before reading anything', async () => {
    const repository = new FakeTranslationRepository();

    await expect(managerOver(repository).decorate(imageSet(), TranslationLanguage.Vietnamese, [asset()])).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.lookups).toHaveLength(0);
  });
});

describe('LibraryTranslationManager.save', () => {
  it('creates the translation and answers with the merged row', async () => {
    const repository = new FakeTranslationRepository();
    const saved = await managerOver(repository).save(novel(), TranslationLanguage.Vietnamese, chapter(), { title: 'Chín hồi chuông cho bến cảng', words: 1980, contentUrl: VI_URL });

    expect(repository.rows.vi).toHaveLength(1);
    expect(saved).toMatchObject({
      id: 'chapter-1',
      title: 'Chín hồi chuông cho bến cảng',
      language: TranslationLanguage.Vietnamese,
      words: 1980,
      contentUrl: VI_URL,
      translated: true,
      sourceTitle: 'Nine Bells for the Harbour',
    });
  });

  it('writes the chapter fields the source owns, so the document is a whole chapter', async () => {
    const repository = new FakeTranslationRepository();

    await managerOver(repository).save(novel(), TranslationLanguage.Vietnamese, chapter(), { title: 'Chương một' });

    expect(repository.rows.vi?.[0]).toMatchObject({ type: LibraryItemType.Novel, index: 412, status: LibraryContentStatus.Completed, sourceUrl: CHAPTER_URL });
  });

  it('files a translation under the language asked for, not the body', async () => {
    const repository = new FakeTranslationRepository();

    await managerOver(repository).save(novel(), TranslationLanguage.Chinese, chapter(), { title: '献给港口的九声钟', language: 'nonsense' });

    expect(repository.rows.zh?.[0]?.language).toBe(TranslationLanguage.Chinese);
    expect(repository.rows.vi).toBeUndefined();
  });

  it('keeps `createdAt` across a rewrite and moves `updatedAt`', async () => {
    const repository = new FakeTranslationRepository({ vi: [translation({ createdAt: NOW, updatedAt: NOW })] });
    const saved = await managerOver(repository).save(novel(), TranslationLanguage.Vietnamese, chapter(), { title: 'Chín hồi chuông', words: 12 });

    expect(saved.createdAt).toBe(NOW);
    expect(saved.updatedAt).toBe(LATER);
    expect(repository.rows.vi).toHaveLength(1);
  });

  it('refuses a translation with no title', async () => {
    await expect(managerOver(new FakeTranslationRepository()).save(novel(), TranslationLanguage.Vietnamese, chapter(), { title: '   ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses a file's fields on a chapter", async () => {
    await expect(managerOver(new FakeTranslationRepository()).save(novel(), TranslationLanguage.Vietnamese, chapter(), { title: 'Chương một', filename: 'ch.txt' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a set', async () => {
    const repository = new FakeTranslationRepository();

    await expect(managerOver(repository).save(imageSet(), TranslationLanguage.Vietnamese, asset(), { title: 'Anything' })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.rows.vi).toBeUndefined();
  });
});

describe('LibraryTranslationManager.coverage', () => {
  it('answers with all three languages, zero included', async () => {
    const repository = new FakeTranslationRepository({ vi: [translation(), translation({ id: 'chapter-2' })] });

    await expect(managerOver(repository).coverage(novel())).resolves.toEqual([
      { language: TranslationLanguage.Vietnamese, translated: 2 },
      { language: TranslationLanguage.English, translated: 0 },
      { language: TranslationLanguage.Chinese, translated: 0 },
    ]);
  });

  it('answers with null for a set, which has no translations to count', async () => {
    await expect(managerOver(new FakeTranslationRepository()).coverage(imageSet())).resolves.toBeNull();
  });
});

describe('LibraryTranslationManager cascades', () => {
  it("drops one chapter's translations", async () => {
    const repository = new FakeTranslationRepository();

    await managerOver(repository).removeFor('novel-1', 'chapter-1');

    expect(repository.removed).toEqual(['chapter-1']);
  });

  it("drops a whole item's", async () => {
    const repository = new FakeTranslationRepository();

    await managerOver(repository).removeAll('novel-1');

    expect(repository.cleared).toEqual(['novel-1']);
  });
});
