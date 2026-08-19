// The writer's constructor names a repository, and that file reaches the Admin SDK —
// where `firebase-admin/auth` pulls in an ESM-only dependency Jest cannot require.
// Nothing here talks to Firebase, so an empty module is enough.
jest.mock('firebase-admin/auth', () => ({}));

import { ArchiveEntry, ArchiveProvider } from '../core/providers/archive.provider';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { LibraryImportSnapshot, RealtimeProvider } from '../core/providers/realtime.provider';
import { LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { LibraryItemStatus, LibraryItemType, LibrarySourceMode, NovelItem, NovelStatus } from './entities/library-item.entity';
import { ImportConflict, PackagedChapter } from './entities/library-package.entity';
import { TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentDraft, LibraryContentRepository, LibraryContentRewrite } from './library-content.repository';
import { PackageRecords } from './library-import.manager';
import { LibraryImportWriter } from './library-import.writer';
import { LibraryTranslationRepository, TranslationRewrite } from './library-translation.repository';

const NOW = '2026-08-11T09:12:04.113Z';

const FIRST_WRITTEN = '2026-07-01T00:00:00.000Z';

const PATH = 'packages/novel-1/a.zip';

const record = (index: number, over: Partial<PackagedChapter> = {}): PackagedChapter =>
  ({ index, title: `Chapter ${index}`, language: 'en', words: 100, sourceUrl: `https://source/${index}`, file: `chapters/000${index}.txt`, ...over });

const manifest = { schema: 1, kind: LibraryItemType.Novel, exportedAt: NOW, project: 'p', source: { itemId: 'novel-1', title: 'x' }, counts: { chapters: 0, bodies: 0, translations: {} } };

function records(over: Partial<PackageRecords> = {}): PackageRecords {
  return { manifest, item: null, chapters: [record(1), record(2)], translations: {}, skipped: [], cover: false, ...over };
}

function chapter(index: number, over: Partial<NovelChapter> = {}): NovelChapter {
  return {
    id: `ch-${index}`,
    type: LibraryItemType.Novel,
    index,
    title: `Stored ${index}`,
    language: 'en',
    words: 5,
    sourceUrl: `https://stored/${index}`,
    contentUrl: `https://storage/stored-${index}.txt`,
    status: LibraryContentStatus.Completed,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const novel = (): NovelItem => ({
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
});

/** Every collaborator the writer has, and what each one was asked to do. */
class Around {
  created: LibraryContentDraft[] = [];

  rewritten: LibraryContentRewrite[] = [];

  upserted: { language: TranslationLanguage, rows: TranslationRewrite[] }[] = [];

  saved: string[] = [];

  discarded: (string | null)[] = [];

  recounts = 0;

  published: LibraryImportSnapshot[] = [];

  constructor(public stored: NovelChapter[] = [], public held: Partial<Record<TranslationLanguage, NovelChapter[]>> = {}) {}

  /** The bodies the archive holds, by entry name. What the second pass walks. */
  bodies: Record<string, string> = { 'chapters/0001.txt': 'One.', 'chapters/0002.txt': 'Two.' };

  writer(): LibraryImportWriter {
    const contents = {
      chapters: () => Promise.resolve(this.stored),
      recount: () => { this.recounts += 1; return Promise.resolve({ total: 0, completed: 0, failed: 0, pending: 0, bytes: 0 }); },
    } as unknown as LibraryContentManager;

    const rows = {
      createMany: (_itemId: string, drafts: LibraryContentDraft[]) => {
        this.created.push(...drafts);

        return Promise.resolve(drafts.map((_draft, at) => `new-${at + 1}`));
      },
      replaceMany: (_itemId: string, rewrites: LibraryContentRewrite[]) => { this.rewritten.push(...rewrites); return Promise.resolve(); },
    } as unknown as LibraryContentRepository;

    const translations = {
      findByIds: (_itemId: string, language: TranslationLanguage, contentIds: string[]) =>
        Promise.resolve(new Map((this.held[language] ?? []).filter(row => contentIds.includes(row.id)).map(row => [row.id, row]))),
      upsertMany: (_itemId: string, language: TranslationLanguage, rows: TranslationRewrite[]) => { this.upserted.push({ language, rows }); return Promise.resolve(); },
    } as unknown as LibraryTranslationRepository;

    const files = {
      saveText: (_itemId: string, text: string) => { this.saved.push(text); return Promise.resolve(`https://storage/${this.saved.length}.txt`); },
      discard: (url: string | null) => { this.discarded.push(url); return Promise.resolve(); },
    } as unknown as ContentFileProvider;

    const archive = {
      readFrom: (_path: string, wanted: (name: string) => boolean, onEntry: ArchiveEntry) =>
        Object.entries(this.bodies).reduce(async (before, [name, body]) => {
          await before;

          if (wanted(name)) {
            await onEntry(name, Buffer.from(body, 'utf8'));
          }
        }, Promise.resolve()),
    } as unknown as ArchiveProvider;

    const realtime = { publishImport: (snapshot: LibraryImportSnapshot) => { this.published.push(snapshot); return Promise.resolve(); } } as unknown as RealtimeProvider;

    return new LibraryImportWriter(contents, rows, translations, files, archive, realtime);
  }
}

describe('LibraryImportWriter', () => {
  it('adds every chapter number the item does not hold, with its text', async () => {
    const around = new Around();

    const outcome = await around.writer().run(novel(), PATH, records(), ImportConflict.Skip);

    expect(outcome).toEqual({ added: 2, overwritten: 0, skipped: 0, translated: 0 });
    expect(around.saved).toEqual(['One.', 'Two.']);
    expect(around.created).toEqual([
      { type: 'novel', index: 1, title: 'Chapter 1', language: 'en', words: 100, sourceUrl: 'https://source/1', contentUrl: 'https://storage/1.txt', status: LibraryContentStatus.Completed },
      { type: 'novel', index: 2, title: 'Chapter 2', language: 'en', words: 100, sourceUrl: 'https://source/2', contentUrl: 'https://storage/2.txt', status: LibraryContentStatus.Completed },
    ]);
  });

  // A chapter we know about and do not hold is not a chapter that is queued — and
  // `pending` is what `counts.pending` reads as work still owed.
  it('files a record with no text as discovered, and uploads nothing for it', async () => {
    const around = new Around();

    const outcome = await around.writer().run(novel(), PATH, records({ chapters: [record(1, { file: null })] }), ImportConflict.Skip);

    expect(around.saved).toEqual([]);
    expect(around.created[0]).toMatchObject({ contentUrl: null, status: LibraryContentStatus.Discovered });
    expect(outcome.added).toBe(1);
  });

  it('keeps a chapter the item already holds, and writes neither its row nor its text', async () => {
    const around = new Around([chapter(1)]);

    const outcome = await around.writer().run(novel(), PATH, records(), ImportConflict.Skip);

    expect(outcome).toMatchObject({ added: 1, overwritten: 0, skipped: 1 });
    expect(around.saved).toEqual(['Two.']);
    expect(around.rewritten).toEqual([]);
  });

  it('rewrites one it holds when asked, and drops the object it replaced', async () => {
    const around = new Around([chapter(1)]);

    const outcome = await around.writer().run(novel(), PATH, records({ chapters: [record(1)] }), ImportConflict.Overwrite);

    expect(outcome).toMatchObject({ overwritten: 1, added: 0 });
    expect(around.rewritten).toHaveLength(1);
    expect(around.rewritten[0]?.id).toBe('ch-1');
    // `sourceUrl` stays the stored row's: it is the address a re-scrape reads, and a
    // package from another site has no business moving it.
    expect(around.rewritten[0]?.draft).toMatchObject({ title: 'Chapter 1', sourceUrl: 'https://stored/1', contentUrl: 'https://storage/1.txt' });
    expect(around.discarded).toEqual(['https://storage/stored-1.txt']);
  });

  // Otherwise a record with no body would blank a stored chapter and orphan its text.
  it('will not let a record with no text overwrite a chapter that has some', async () => {
    const around = new Around([chapter(1)]);

    const outcome = await around.writer().run(novel(), PATH, records({ chapters: [record(1, { file: null })] }), ImportConflict.Overwrite);

    expect(outcome).toMatchObject({ overwritten: 0, skipped: 1 });
    expect(around.rewritten).toEqual([]);
    expect(around.discarded).toEqual([]);
  });

  it('files a translation under a chapter the same run created', async () => {
    const around = new Around();

    around.bodies = { 'chapters/0001.txt': 'One.', 'translations/vi/0001.txt': 'Chương một' };

    const packaged = records({ chapters: [record(1)], translations: { vi: [record(1, { title: 'Chương một', file: 'translations/vi/0001.txt' })] } });
    const outcome = await around.writer().run(novel(), PATH, packaged, ImportConflict.Skip);

    expect(outcome).toMatchObject({ added: 1, translated: 1 });
    expect(around.upserted).toHaveLength(1);
    expect(around.upserted[0]?.language).toBe('vi');
    expect(around.upserted[0]?.rows[0]).toMatchObject({ contentId: 'new-1', createdAt: null });
    // The three copied fields are the chapter's own — part 4's rule, kept here.
    expect(around.upserted[0]?.rows[0]?.draft).toMatchObject({ title: 'Chương một', language: 'vi', index: 1, sourceUrl: 'https://source/1', status: LibraryContentStatus.Completed });
  });

  it('keeps a translation the item already holds, unless the policy says otherwise', async () => {
    const packaged = records({ chapters: [record(1)], translations: { vi: [record(1, { file: 'translations/vi/0001.txt' })] } });
    const bodies = { 'chapters/0001.txt': 'One.', 'translations/vi/0001.txt': 'Chương một' };

    const kept = new Around([chapter(1)], { vi: [chapter(1, { id: 'ch-1', contentUrl: 'https://storage/old-vi.txt', createdAt: FIRST_WRITTEN })] });

    kept.bodies = bodies;

    await expect(kept.writer().run(novel(), PATH, packaged, ImportConflict.Skip)).resolves.toMatchObject({ translated: 0 });
    expect(kept.upserted).toEqual([{ language: 'vi', rows: [] }]);

    const forced = new Around([chapter(1)], { vi: [chapter(1, { id: 'ch-1', contentUrl: 'https://storage/old-vi.txt', createdAt: FIRST_WRITTEN })] });

    forced.bodies = bodies;

    await expect(forced.writer().run(novel(), PATH, packaged, ImportConflict.Overwrite)).resolves.toMatchObject({ translated: 1 });
    // The date the document was first written at survives a rewrite, as `upsert`
    // promises one row at a time.
    expect(forced.upserted[0]?.rows[0]).toMatchObject({ contentId: 'ch-1', createdAt: FIRST_WRITTEN });
    expect(forced.discarded).toContain('https://storage/old-vi.txt');
  });

  // The policy is about the chapter's text, not about a language the item has none in.
  it('files a translation under a chapter the policy skipped', async () => {
    const around = new Around([chapter(1)]);

    around.bodies = { 'chapters/0001.txt': 'One.', 'translations/vi/0001.txt': 'Chương một' };

    const packaged = records({ chapters: [record(1)], translations: { vi: [record(1, { file: 'translations/vi/0001.txt' })] } });
    const outcome = await around.writer().run(novel(), PATH, packaged, ImportConflict.Skip);

    expect(outcome).toMatchObject({ added: 0, overwritten: 0, skipped: 1, translated: 1 });
    expect(around.upserted[0]?.rows[0]).toMatchObject({ contentId: 'ch-1', createdAt: null });
    // The chapter's own fields come off the row that is filed, not off the text this run declined to write.
    expect(around.upserted[0]?.rows[0]?.draft).toMatchObject({ language: 'vi', index: 1, sourceUrl: 'https://stored/1', status: LibraryContentStatus.Completed });
    // Only the translation's text was uploaded: the skipped chapter's body is dropped.
    expect(around.saved).toEqual(['Chương một']);
  });

  // Six hundred recounts would be six hundred writes to one item document, and
  // Firestore sustains about one a second to a single one.
  it('recounts the item exactly once', async () => {
    const around = new Around();

    await around.writer().run(novel(), PATH, records(), ImportConflict.Skip);

    expect(around.recounts).toBe(1);
  });

  it('opens the live node with what the bar divides by, and closes it with the summary', async () => {
    const around = new Around();

    await around.writer().run(novel(), PATH, records(), ImportConflict.Skip);

    expect(around.published[0]).toMatchObject({ itemId: 'novel-1', status: 'running', total: 2, done: 0 });
    // `done` again at the end, so the bar lands full: two bodies never reach a tick,
    // and a bar stopped at 0% reads as an import that did nothing.
    expect(around.published.at(-1)).toMatchObject({ status: 'completed', done: 2, added: 2, overwritten: 0, skipped: 0, translated: 0 });
  });
});
