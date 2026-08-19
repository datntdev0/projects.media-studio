import { Injectable } from '@nestjs/common';
import { ArchiveProvider } from '../core/providers/archive.provider';
import { ContentFileProvider } from '../core/providers/content-file.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { LibraryContentStatus, NovelChapter } from './entities/library-content.entity';
import { LibraryItemType, NovelItem } from './entities/library-item.entity';
import { ImportConflict, PackagedChapter, bodyEntryLanguage, isBodyEntry } from './entities/library-package.entity';
import { TranslationLanguage } from './entities/library-translation.entity';
import { LibraryContentManager } from './library-content.manager';
import { LibraryContentRepository } from './library-content.repository';
// `import type`, so the pair reads one way at runtime: the manager holds this class,
// and this class holds nothing but the shape the manager reads a package into.
import type { PackageRecords } from './library-import.manager';
import { LibraryTranslationRepository, TranslationDraft } from './library-translation.repository';

/** How often the live node is written. 1,280 bodies is not 1,280 reasons to say a bar moved. */
const PUBLISH_EVERY = 10;

const RUNNING = 'running';

const COMPLETED = 'completed';

/** What a package's chapter record turns out to mean for the target. */
type ChapterAction = 'add' | 'overwrite' | 'skip';

/** A chapter and a translation are the same stored shape, so one draft type serves both. */
type ChapterDraft = TranslationDraft;

interface PlannedChapter {
  record: PackagedChapter;
  action: ChapterAction;
  /** The row this record lines up with, by chapter number. Null where the number is new. */
  stored: NovelChapter | null;
  /** Where the imported text landed. Filled in by the body pass. */
  contentUrl: string | null;
  /** The document a translation is filed under. Settled once the chapters are flushed. */
  id: string | null;
}

interface PlannedTranslation {
  language: TranslationLanguage;
  record: PackagedChapter;
  /** False where the target already holds this translation and the policy says keep. */
  write: boolean;
  /** The date the stored translation was first written at, so a rewrite keeps it. */
  createdAt: string | null;
  /** The object the stored translation points at, dropped once the rewrite lands. */
  replaced: string | null;
  contentUrl: string | null;
}

interface ImportPlan {
  chapters: PlannedChapter[];
  translations: PlannedTranslation[];
}

/** What the run did, as the dialog's summary reads it. */
export interface ImportOutcome {
  added: number;
  overwritten: number;
  skipped: number;
  translated: number;
}

/**
 * A package, written into an item.
 *
 * Every decision is made before a byte of text is read: the plan below says what each
 * record means for the target, and the pass that follows only fills in where the text
 * landed. That is what makes entry order irrelevant, and it is why the archive is read
 * twice rather than once — a single pass would have to decide about a body before
 * knowing whether the record naming it exists.
 *
 * Every Firestore write is batched and the item is recounted **once**. Six hundred
 * calls to `LibraryContentManager.replace` would be six hundred writes to one item
 * document, and Firestore sustains about one a second to a single document — that is
 * contention, not slowness.
 */
@Injectable()
export class LibraryImportWriter {
  constructor(
    private readonly contents: LibraryContentManager,
    private readonly rows: LibraryContentRepository,
    private readonly translations: LibraryTranslationRepository,
    private readonly files: ContentFileProvider,
    private readonly archive: ArchiveProvider,
    private readonly realtime: RealtimeProvider,
  ) {}

  async run(item: NovelItem, path: string, records: PackageRecords, onConflict: ImportConflict): Promise<ImportOutcome> {
    const stored = await this.contents.chapters(item.id);
    const plan = planFor(records, stored, await this.storedTranslations(item.id, records, stored), onConflict);
    const total = bodyCount(records);

    await this.realtime.publishImport({ itemId: item.id, status: RUNNING, total, done: 0, error: '' });
    await this.fill(item.id, path, plan, total);

    const outcome = await this.flush(item, plan);

    // `done` again, so the bar ends full: a package of three bodies never reaches a
    // tick, and one that stopped at 0% would read as an import that did nothing.
    await this.realtime.publishImport({ itemId: item.id, status: COMPLETED, done: total, label: '', ...outcome });

    return outcome;
  }

  /** Whatever the target already holds in each language the package carries. */
  private async storedTranslations(itemId: string, records: PackageRecords, stored: NovelChapter[]): Promise<Map<TranslationLanguage, Map<string, NovelChapter>>> {
    const held = new Map<TranslationLanguage, Map<string, NovelChapter>>();
    const contentIds = stored.map((chapter) => chapter.id);

    for (const language of Object.keys(records.translations) as TranslationLanguage[]) {
      held.set(language, await this.translations.findByIds(itemId, language, contentIds));
    }

    return held;
  }

  /**
   * The second pass: every body, straight from the archive into Storage.
   *
   * A body whose plan says skip is counted and dropped — the bar is over what the
   * package holds, not over what turned out to be worth writing — and its text is
   * never uploaded.
   */
  private async fill(itemId: string, path: string, plan: ImportPlan, total: number): Promise<void> {
    const chapters = entriesBy(plan.chapters, (planned) => planned.action !== 'skip');
    const translations = entriesBy(plan.translations, (planned) => planned.write);
    let done = 0;

    await this.archive.readFrom(path, isBodyEntry, async (name, body) => {
      const planned = bodyEntryLanguage(name) ? translations.get(name) : chapters.get(name);

      done += 1;

      if (planned) {
        planned.contentUrl = await this.files.saveText(itemId, body.toString('utf8'));
      }

      if (done % PUBLISH_EVERY === 0 || done === total) {
        await this.realtime.publishImport({ itemId, done, label: planned ? `Chapter ${planned.record.index} · ${planned.record.title}` : '' });
      }
    });
  }

  /**
   * The writes, in the one order that works: the chapters first, because a
   * translation is filed under a chapter's document id and an added chapter has none
   * until `createMany` allocates it.
   */
  private async flush(item: NovelItem, plan: ImportPlan): Promise<ImportOutcome> {
    const adds = plan.chapters.filter((planned) => planned.action === 'add');
    const overwrites = plan.chapters.filter((planned) => planned.action === 'overwrite');
    const created = await this.rows.createMany(item.id, adds.map(chapterDraft));

    adds.forEach((planned, at) => { planned.id = created[at] ?? null; });
    // Every chapter the package matched, not only the rewritten ones: a translation is
    // filed under its chapter's id whether or not the chapter itself was written.
    plan.chapters.forEach((planned) => { planned.id ??= planned.stored?.id ?? null; });

    await this.rows.replaceMany(item.id, overwrites.flatMap((planned) => planned.id ? [{ id: planned.id, draft: chapterDraft(planned) }] : []));

    const translated = await this.flushTranslations(item.id, plan);

    await this.contents.recount(item);
    await this.discardReplaced(plan, overwrites);

    return { added: adds.length, overwritten: overwrites.length, skipped: plan.chapters.length - adds.length - overwrites.length, translated };
  }

  /** One batch per language, over the chapter ids the flush above has just settled. */
  private async flushTranslations(itemId: string, plan: ImportPlan): Promise<number> {
    const byIndex = new Map(plan.chapters.flatMap((planned) => planned.id ? [[planned.record.index, planned] as const] : []));
    let written = 0;

    for (const language of new Set(plan.translations.map((planned) => planned.language))) {
      const rows = plan.translations.flatMap((planned) => {
        const chapter = planned.language === language && planned.write ? byIndex.get(planned.record.index) : undefined;

        return chapter?.id ? [{ contentId: chapter.id, createdAt: planned.createdAt, draft: translationDraft(language, planned, chapterDraft(chapter)) }] : [];
      });

      await this.translations.upsertMany(itemId, language, rows);
      written += rows.length;
    }

    return written;
  }

  /**
   * The objects the rewritten rows no longer point at, dropped **after** the flush:
   * discarding them earlier would leave a row pointing at nothing if the batch failed.
   */
  private async discardReplaced(plan: ImportPlan, overwrites: PlannedChapter[]): Promise<void> {
    const replaced = [
      ...overwrites.map((planned) => planned.stored?.contentUrl ?? null),
      ...plan.translations.filter((planned) => planned.write).map((planned) => planned.replaced),
    ];

    for (const url of replaced) {
      await this.files.discard(url);
    }
  }
}

/** The entries worth reading, by the name each one is filed under. */
function entriesBy<T extends { record: PackagedChapter }>(planned: T[], keep: (one: T) => boolean): Map<string, T> {
  return new Map(planned.flatMap((one) => one.record.file && keep(one) ? [[one.record.file, one] as const] : []));
}

/**
 * What every record means for the target, decided in one place and before anything
 * is read.
 *
 * Matched on `index`, the chapter number, which is what the mockup promises:
 * *"Importing into this item merges by chapter number."*
 */
function planFor(records: PackageRecords, stored: NovelChapter[], held: Map<TranslationLanguage, Map<string, NovelChapter>>, onConflict: ImportConflict): ImportPlan {
  const byIndex = new Map(stored.map((chapter) => [chapter.index, chapter] as const));

  const chapters = (records.chapters ?? []).map<PlannedChapter>((record) => {
    const existing = byIndex.get(record.index) ?? null;

    return { record, action: actionFor(record, existing, onConflict), stored: existing, contentUrl: null, id: null };
  });

  const translations = Object.entries(records.translations).flatMap(([code, rows]) => {
    const language = code as TranslationLanguage;

    return rows.map<PlannedTranslation>((record) => {
      const existing = byIndex.get(record.index);
      const translation = existing ? held.get(language)?.get(existing.id) : undefined;

      // The policy applies to the translation on its own: a chapter kept because the
      // target already has its text has no opinion about a language it has none in.
      return {
        language,
        record,
        write: !translation || onConflict === ImportConflict.Overwrite,
        createdAt: translation?.createdAt ?? null,
        replaced: translation?.contentUrl ?? null,
        contentUrl: null,
      };
    });
  });

  return { chapters, translations };
}

/**
 * A chapter number the target does not hold is added whatever the policy says. One it
 * does is overwritten only when asked **and** when the package has text to put there:
 * a record with no body would otherwise blank a stored chapter and orphan its object.
 */
function actionFor(record: PackagedChapter, existing: NovelChapter | null, onConflict: ImportConflict): ChapterAction {
  if (!existing) {
    return 'add';
  }

  return onConflict === ImportConflict.Overwrite && record.file ? 'overwrite' : 'skip';
}

/**
 * A chapter as the package has it.
 *
 * `sourceUrl` is the stored row's where there is one, for the reason `nextDraft` gives:
 * it is the address a re-scrape reads, and a package from another site has no business
 * moving it. So is `contentUrl` where the policy kept the chapter: that draft is only
 * ever read as a translation's source, and it should describe the row that is filed
 * rather than the text this run declined to write. `status` is `discovered` rather than
 * `pending` for a record with no text — a chapter we know about and do not hold is not
 * a chapter that is queued.
 */
function chapterDraft(planned: PlannedChapter): ChapterDraft {
  const { record, stored } = planned;
  const contentUrl = planned.contentUrl ?? (planned.action === 'skip' ? stored?.contentUrl ?? null : null);

  return {
    type: LibraryItemType.Novel,
    index: record.index,
    title: record.title,
    language: record.language,
    words: record.words,
    sourceUrl: stored?.sourceUrl ?? record.sourceUrl,
    contentUrl,
    status: contentUrl ? LibraryContentStatus.Completed : LibraryContentStatus.Discovered,
  };
}

/**
 * The chapter's own draft with the four fields a translation owns changed — part 4's
 * rule as code: `index`, `status` and `sourceUrl` describe the chapter, not the text.
 */
function translationDraft(language: TranslationLanguage, planned: PlannedTranslation, source: ChapterDraft): TranslationDraft {
  return { ...source, title: planned.record.title, language, words: planned.record.words, contentUrl: planned.contentUrl };
}

/** What the bar divides by: every body the package holds, written or skipped. */
export function bodyCount(records: PackageRecords): number {
  const chapters = (records.chapters ?? []).filter((record) => record.file).length;
  const translations = Object.values(records.translations).flat().filter((record) => record.file).length;

  return chapters + translations;
}
