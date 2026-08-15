import { Injectable, Logger } from '@nestjs/common';
import { Reference } from 'firebase-admin/database';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/** Where the live tree is rooted. Nothing outside this class spells a path under it. */
const RUNNING_JOBS_ROOT = 'scrapings/runningJobs';

/** How many rows go in one multi-path update — the batch size the Firestore writes beside it use. */
const UPDATE_CHUNK = 500;

/**
 * The item the job is over: which one it is, and what it holds as of this write.
 *
 * Identity and aggregate in one block because they describe one thing. They arrive at
 * different moments — the identity when the job is recorded, the counters as chapters
 * land — so every field is optional and `publishJob` merges them field by field.
 *
 * `pending` is carried rather than derived: the four counters are written in a single
 * `update`, so they cannot disagree. Derived on the client it would be right only for
 * as long as the other three happened to arrive together.
 *
 * No status. The item's own is the person's — `draft` or `ready` — and a screen draws
 * **Scraping** from the presence of a running job rather than from anything stored.
 */
export interface ScrapingLibrarySnapshot {
  id?: string;
  type?: string;
  /** As the item was called when the job was described. */
  title?: string;
  /** Every row of the item, not of the job. */
  total?: number;
  completed?: number;
  failed?: number;
  /** Queued or in flight — what is still owed on the item. */
  pending?: number;
}

/**
 * One job's live summary.
 *
 * Only `id` is required. Every write here is an `update`, so a transition sends the
 * fields it moved and leaves the rest of the node where it is — which is what keeps a
 * chapter completing from costing a read of the job it belonged to.
 *
 * Timestamps are epoch milliseconds, and ISO strings in Firestore: these are compared
 * and never displayed. Statuses are plain strings, and are the caller's own enum values
 * verbatim — core holds no domain types, for the reason `queue.messages.ts` states about
 * a message and which holds for a node too.
 */
export interface ScrapingJobSnapshot {
  id: string;
  status?: string;
  range?: string;
  refetch?: boolean;
  startAt?: number;
  queuedAt?: number;
  total?: number;
  completed?: number;
  failed?: number;
  library?: ScrapingLibrarySnapshot;
}

/** One task, as the chapter table reads it. `index` saves the screen a lookup to name it. */
export interface ScrapingTaskRow {
  contentId: string;
  status: string;
  index: number;
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
 * One tree with one writer. `ScrapingJobManager` is that writer: the two library
 * managers keep their Firestore writes and publish nothing, because a job's progress is
 * the job's to publish.
 */
@Injectable()
export class RealtimeProvider {
  private readonly logger = new Logger(RealtimeProvider.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  /**
   * The summary, and whatever of the item the caller has, in one `update`. Stamped,
   * so a node can be recognised as stale.
   *
   * The `library` block goes in as `library/<field>` paths rather than as an object:
   * an `update` replaces a child it is handed whole, so the identity written when the
   * job was recorded would be wiped by the first completion's counters.
   */
  async publishJob(job: ScrapingJobSnapshot): Promise<void> {
    const { library, ...summary } = job;
    const fields: Record<string, unknown> = { ...stated(summary), updatedAt: Date.now() };

    Object.entries(stated(library ?? {})).forEach(([field, value]) => {
      fields[`library/${field}`] = value;
    });

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

  private rootRef(): Reference {
    return this.firebase.database.ref(RUNNING_JOBS_ROOT);
  }

  private jobRef(jobId: string): Reference {
    return this.firebase.database.ref(`${RUNNING_JOBS_ROOT}/${jobId}`);
  }

  private tasksRef(jobId: string): Reference {
    return this.firebase.database.ref(`${RUNNING_JOBS_ROOT}/${jobId}/tasks`);
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
