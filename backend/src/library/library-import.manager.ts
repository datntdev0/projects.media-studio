import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { objectPathFrom } from '../core/firebase/storage-url';
import { ArchiveProvider } from '../core/providers/archive.provider';
import { RealtimeProvider } from '../core/providers/realtime.provider';
import { QueueProducer } from '../core/queues/queue.producer';
import { QueueTopic } from '../core/queues/queue.messages';
import { CreateLibraryItemDto } from './dto/library-item-create.dto';
import { LibraryImportDto, LibraryPackageReportDto, StartLibraryImportDto } from './dto/library-package.dto';
import { LibraryItemType, NovelItem } from './entities/library-item.entity';
import { CHAPTERS_ENTRY, ITEM_ENTRY, ImportConflict, MANIFEST_ENTRY, NOT_PACKAGEABLE, PackageManifest, PackagedChapter, PackagedTranslations, isCoverEntry, isPackageEntry, isRecordEntry, translationsEntryLanguage } from './entities/library-package.entity';
import { LibraryContentManager } from './library-content.manager';
import { report } from './library-import.report';
import { LibraryImportWriter, bodyCount } from './library-import.writer';
import { LibraryManager } from './library.manager';
import { LibraryRepository } from './library.repository';

/** What a package with nothing to read by is refused with. Its cause is logged, not shown. */
const NO_MANIFEST = `The package has no readable ${MANIFEST_ENTRY}`;

const NOT_OURS = 'That is not a package in this bucket';

/** The endpoint validates for itself: a client cannot skip a check by not asking for one. */
const NOT_VALID = 'That package did not pass validation';

const ALREADY_RUNNING = 'An import is already running over this item';

/** What the live node reads while a pass is under way, and what a second one is refused on. */
const RUNNING = 'running';

const FAILED = 'failed';

/**
 * Everything a package says about itself, read without any of its text.
 *
 * `chapters` is null where there is no `chapters.json` at all, which is a broken
 * package — an empty array is a novel with no chapters, and the two are not the
 * same fact.
 */
export interface PackageRecords {
  manifest: PackageManifest;
  item: CreateLibraryItemDto | null;
  chapters: PackagedChapter[] | null;
  translations: PackagedTranslations;
  /** Entries the format does not know, left alone. */
  skipped: string[];
  cover: boolean;
}

/**
 * Reading a package, and saying what is in it.
 *
 * The pass below is the only way into an archive on this side, and it reads the
 * small half: the manifest, the item, and one records file per language. Every body
 * goes past undecompressed, which is what makes validation cheap enough to run twice
 * — once for the person, once for the endpoint that will not take their word for it.
 */
@Injectable()
export class LibraryImportManager {
  private readonly logger = new Logger(LibraryImportManager.name);

  constructor(
    private readonly items: LibraryRepository,
    private readonly library: LibraryManager,
    private readonly contents: LibraryContentManager,
    private readonly writer: LibraryImportWriter,
    private readonly archive: ArchiveProvider,
    private readonly realtime: RealtimeProvider,
    private readonly queue: QueueProducer,
  ) {}

  /** What the dialog draws before anything is written. Writes nothing, and is safe to call twice. */
  async validate(itemId: string, packageUrl: string): Promise<LibraryPackageReportDto> {
    const item = await this.require(itemId);

    return this.reportFor(item, await this.read(packageUrl));
  }

  /**
   * The request half of an import: everything that has to happen while somebody is
   * waiting, and nothing that does not.
   *
   * It validates again — one read of the small half of the archive — because an
   * endpoint that trusts a client to have asked a question is an endpoint that can be
   * asked not to. Under `NewItem` the target is created here rather than on the
   * consumer, so the answer can name it.
   */
  async start(itemId: string, input: StartLibraryImportDto): Promise<LibraryImportDto> {
    const item = await this.require(itemId);
    const records = await this.read(input.packageUrl);
    const intoNew = input.onConflict === ImportConflict.NewItem;

    if (!(await this.reportFor(item, records)).valid) {
      throw new BadRequestException(NOT_VALID);
    }

    // Checked before the copy, so a refused request never leaves a stray item behind.
    // A brand new one cannot have an import running over it.
    if (!intoNew) {
      await this.refuseWhileRunning(itemId);
    }

    const target = intoNew ? await this.copy(records) : itemId;

    await this.queue.send(QueueTopic.LibraryImportRequested, { itemId: target, packageUrl: input.packageUrl, onConflict: input.onConflict });

    return { itemId: target, total: bodyCount(records) };
  }

  /**
   * The whole import, where nobody is waiting for it.
   *
   * The package is dropped only on success: a failed import is re-run by pressing
   * Import again, and a retry needs something to read.
   */
  async run(itemId: string, packageUrl: string, onConflict: ImportConflict): Promise<void> {
    const item = await this.require(itemId);
    const path = this.pathOf(packageUrl);
    const records = await this.read(packageUrl);

    try {
      const outcome = await this.writer.run(item, path, records, onConflict);

      this.logger.log(`Imported into ${itemId}: ${outcome.added} added, ${outcome.overwritten} overwritten, ${outcome.skipped} skipped, ${outcome.translated} translated`);
    } catch (cause: unknown) {
      await this.realtime.publishImport({ itemId, status: FAILED, error: cause instanceof Error ? cause.message : String(cause) });

      throw cause;
    }

    await this.archive.remove(path);
  }

  /** The report, over the target's own chapter numbers. */
  private async reportFor(item: NovelItem, records: PackageRecords): Promise<LibraryPackageReportDto> {
    const stored = await this.contents.chapters(item.id);

    return report(item, records, new Set(stored.map((chapter) => chapter.index)));
  }

  /**
   * A second item from the package's own `item.json` — the mockup's *"Import as new
   * library item"*, and what makes a package from another workspace useful.
   *
   * `type` is forced rather than trusted: the record is JSON out of an archive, and
   * the manifest has already been checked to say novel.
   */
  private async copy(records: PackageRecords): Promise<string> {
    if (!records.item) {
      throw new BadRequestException(`The package has no ${ITEM_ENTRY} to make an item from`);
    }

    return (await this.library.create({ ...records.item, type: LibraryItemType.Novel })).id;
  }

  private async refuseWhileRunning(itemId: string): Promise<void> {
    if ((await this.realtime.runningImport(itemId))?.status === RUNNING) {
      throw new ConflictException(ALREADY_RUNNING);
    }
  }

  /**
   * The first pass: the records, and the names of everything else.
   *
   * `wanted` decides from the name alone because the reader cannot seek — see
   * `ArchiveProvider`. It also collects, which is what makes the report's `skipped`
   * free: an entry the format does not know is one nothing asked for.
   */
  async read(packageUrl: string): Promise<PackageRecords> {
    const path = this.pathOf(packageUrl);
    const found = new Map<string, Buffer>();
    const skipped: string[] = [];
    let cover = false;

    await this.archive.readFrom(path, (name) => {
      if (isCoverEntry(name)) {
        cover = true;
      } else if (!isPackageEntry(name)) {
        skipped.push(name);
      }

      return isRecordEntry(name);
    }, (name, body) => {
      found.set(name, body);

      return Promise.resolve();
    });

    const manifest = parse<PackageManifest>(found, MANIFEST_ENTRY);

    if (!manifest) {
      throw new BadRequestException(NO_MANIFEST);
    }

    return { manifest, item: parse(found, ITEM_ENTRY), chapters: parse(found, CHAPTERS_ENTRY), translations: translationsIn(found), skipped, cover };
  }

  /** The object a package URL names, or the refusal. Nothing outside this bucket is readable. */
  pathOf(packageUrl: string): string {
    const path = objectPathFrom(packageUrl);

    if (!path) {
      throw new BadRequestException(NOT_OURS);
    }

    return path;
  }

  /** The item, a novel, or the refusal each case owes. */
  async require(itemId: string): Promise<NovelItem> {
    const item = await this.items.findById(itemId);

    if (!item) {
      throw new NotFoundException(`No library item ${itemId}`);
    }

    if (item.type !== LibraryItemType.Novel) {
      throw new BadRequestException(NOT_PACKAGEABLE);
    }

    return item;
  }
}

/** One records file per language the archive carried. A language it did not is absent, not empty. */
function translationsIn(found: Map<string, Buffer>): PackagedTranslations {
  const translations: PackagedTranslations = {};

  for (const name of found.keys()) {
    const language = translationsEntryLanguage(name);
    const records = language ? parse<PackagedChapter[]>(found, name) : null;

    if (language && records) {
      translations[language] = records;
    }
  }

  return translations;
}

function parse<T>(found: Map<string, Buffer>, name: string): T | null {
  const body = found.get(name);

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body.toString('utf8')) as T;
  } catch {
    // A record file that will not parse reads as one that is not there, and the
    // check built from it says so in the row it was going to fill.
    return null;
  }
}
