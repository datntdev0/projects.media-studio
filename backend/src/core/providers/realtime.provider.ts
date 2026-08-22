import { Injectable, Logger } from '@nestjs/common';
import { Reference } from 'firebase-admin/database';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/** Where the live tree is rooted. Nothing outside this class spells a path under it. */
const RUNNING_JOBS_ROOT = 'scrapings/runningJobs';

/** The other live tree: one node per item something is being unpacked into. */
const LIBRARY_IMPORTS_ROOT = 'libraryImports';

/** How many rows go in one multi-path update — the batch size the Firestore writes beside it use. */
const UPDATE_CHUNK = 500;

/**
 * One job's live summary.
 *
 * Only `id` is required. Every write here is an `update`, so a transition sends the
 * fields it moved and leaves the rest of the node where it is — which is what keeps a
 * chapter completing from costing a read of the job it belonged to.
 *
 * The counters are the job's own tasks, never the item's rows: a job over chapters
 * 1–20 knows nothing about the other 1,285, and the Library screens refetch for those.
 * `libraryId` is here so a screen can find the job running over the item it draws.
 *
 * Timestamps are epoch milliseconds, and ISO strings in Firestore: these are compared
 * and never displayed. Statuses are plain strings, and are the caller's own enum values
 * verbatim — core holds no domain types, for the reason `queue.messages.ts` states about
 * a message and which holds for a node too.
 */
export interface ScrapingJobSnapshot {
  id: string;
  libraryId?: string;
  status?: string;
  range?: string;
  refetch?: boolean;
  startAt?: number;
  queuedAt?: number;
  total?: number;
  completed?: number;
  failed?: number;
}

/** One task, as the chapter table reads it. `index` saves the screen a lookup to name it. */
export interface ScrapingTaskRow {
  contentId: string;
  status: string;
  index: number;
}

/**
 * One item's running — or last — import.
 *
 * Keyed by the item rather than by a job, because there is no import record: nothing
 * lists past imports and nothing queries one, so the node is the whole of what an
 * import is remembered by. It survives the run deliberately, which is what lets a
 * reopened dialog say what the last one did; the item's deletion is what clears it.
 *
 * Only `itemId` is required, for `ScrapingJobSnapshot`'s reason: every write is an
 * `update`, so a bar moving costs nothing but the fields that moved.
 */
export interface LibraryImportSnapshot {
  itemId: string;
  status?: string;
  /** Bodies to write — chapters plus translations. What the bar divides by. */
  total?: number;
  done?: number;
  /** "Chapter 412 · Nine Bells for the Harbour". */
  label?: string;
  added?: number;
  overwritten?: number;
  skipped?: number;
  translated?: number;
  error?: string;
}

/**
 * The live state of the running jobs, mirrored where the browser can subscribe to it.
 *
 * Firestore holds the truth; this is a derived tree the screens watch so a job that
 * runs for hours is visible while it runs. It is the Realtime Database rather than a
 * Firestore listener for the reasons the plan records — chiefly that Firestore bills per
 * read and write, so the cost of showing progress would scale with the number of people
 * watching it, and that this needs none of the querying Firestore is better at.
 *
 * **Nothing here throws.** A publish is a courtesy to a screen: a chapter that has been
 * fetched, stored and completed must not be scraped again because a mirror write failed.
 * Every method funnels through `attempt`, which logs and swallows, and that is the whole
 * of this class's error handling — which is why no caller has a `try`.
 *
 * Two trees, one writer each. `ScrapingManager` writes the jobs; `LibraryImportWriter`
 * writes the imports. The library's own managers keep their Firestore writes and publish
 * nothing, because a job's progress is the job's to publish.
 */
@Injectable()
export class RealtimeProvider {
  private readonly logger = new Logger(RealtimeProvider.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  /** Whatever of the summary the caller has, in one `update`. Stamped, so a node can be recognised as stale. */
  async publishJob(job: ScrapingJobSnapshot): Promise<void> {
    const fields: Record<string, unknown> = { ...stated(job), updatedAt: Date.now() };

    await this.attempt(`job ${job.id}`, () => this.jobRef(job.id).update(fields));
  }

  /**
   * The whole claimed set, in as few round trips as it takes.
   *
   * Chunked because a novel is a thousand rows and this is the one burst in the job —
   * everything after it is a row at a time. A chunk that fails is logged and the rest
   * still go: a partial subtree draws a partly live table, which beats none.
   */
  async publishTasks(jobId: string, rows: ScrapingTaskRow[]): Promise<void> {
    for (let from = 0; from < rows.length; from += UPDATE_CHUNK) {
      const chunk = rows.slice(from, from + UPDATE_CHUNK);
      const fields: Record<string, unknown> = {};

      chunk.forEach((row) => {
        fields[row.contentId] = { status: row.status, index: row.index };
      });

      await this.attempt(`${chunk.length} task(s) of job ${jobId}`, () => this.tasksRef(jobId).update(fields));
    }
  }

  /**
   * One task moving — what flips a badge in the chapter table.
   *
   * The status alone, and `update` rather than `set`: `publishTasks` wrote the row's
   * `index` when the job claimed it, and a transition has no business rewriting it.
   * That is also what keeps this off a read — the caller knows which task moved and
   * where to, and needs to know nothing else about it.
   */
  async publishTask(jobId: string, contentId: string, status: string): Promise<void> {
    await this.attempt(`task ${contentId} of job ${jobId}`, () => this.tasksRef(jobId).child(contentId).update({ status }));
  }

  /**
   * Every node and its status — the one read on this class, and what the sweep works
   * from. Answers empty where the read failed, so a failed sweep skips a tick rather
   * than taking the whole tick with it.
   */
  async runningJobs(): Promise<Record<string, string>> {
    try {
      const nodes = (await this.rootRef().get()).val() as Record<string, { status?: string }> | null;

      return Object.fromEntries(Object.entries(nodes ?? {}).map(([id, node]) => [id, node.status ?? '']));
    } catch (cause: unknown) {
      this.logger.warn('Could not read the running jobs', cause);

      return {};
    }
  }

  /** A job's whole node, once it has settled and the screens have caught up. */
  async clearJob(jobId: string): Promise<void> {
    await this.attempt(`the node of job ${jobId}`, () => this.jobRef(jobId).remove());
  }

  /** Whatever of an import's state the caller has, in one `update`. */
  async publishImport(snapshot: LibraryImportSnapshot): Promise<void> {
    const fields: Record<string, unknown> = { ...stated(snapshot), updatedAt: Date.now() };

    await this.attempt(`the import of item ${snapshot.itemId}`, () => this.importRef(snapshot.itemId).update(fields));
  }

  /** What the last import into an item did, dropped — which only its deletion asks for. */
  async clearImport(itemId: string): Promise<void> {
    await this.attempt(`the import node of item ${itemId}`, () => this.importRef(itemId).remove());
  }

  /** The node as it stands, or null. What tells an endpoint an import is already running. */
  async runningImport(itemId: string): Promise<LibraryImportSnapshot | null> {
    try {
      return (await this.importRef(itemId).get()).val() as LibraryImportSnapshot | null;
    } catch (cause: unknown) {
      this.logger.warn(`Could not read the import of item ${itemId}`, cause);

      return null;
    }
  }

  private rootRef(): Reference {
    return this.firebase.database.ref(RUNNING_JOBS_ROOT);
  }

  private jobRef(jobId: string): Reference {
    return this.firebase.database.ref(`${RUNNING_JOBS_ROOT}/${jobId}`);
  }

  private tasksRef(jobId: string): Reference {
    return this.firebase.database.ref(`${RUNNING_JOBS_ROOT}/${jobId}/tasks`);
  }

  private importRef(itemId: string): Reference {
    return this.firebase.database.ref(`${LIBRARY_IMPORTS_ROOT}/${itemId}`);
  }

  /** The swallow, stated once. `what` completes the sentence "Could not publish …". */
  private async attempt(what: string, write: () => Promise<unknown>): Promise<void> {
    try {
      await write();
    } catch (cause: unknown) {
      this.logger.warn(`Could not publish ${what}`, cause);
    }
  }
}

/**
 * The fields the caller actually stated. An `update` rejects an `undefined` value
 * outright, and a partial snapshot is the whole point of the shape above.
 */
function stated(fields: object): Record<string, unknown> {
  const entries = Object.entries(fields) as [string, unknown][];

  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}
