import { Injectable, Logger } from '@nestjs/common';
import { Reference } from 'firebase-admin/database';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';

/** Where the live tree is rooted. Nothing outside this class spells a path under it. */
const SCRAPING_ROOT = 'scraping';

/** How many rows go in one multi-path update — the batch size the Firestore writes beside it use. */
const UPDATE_CHUNK = 500;

/**
 * One item's live summary.
 *
 * `pending` is carried rather than derived: the five are written in a single `update`,
 * so they cannot disagree. Derived on the client it would be right only for as long as
 * the other three happened to arrive together.
 *
 * `status` is a plain string here, and is the caller's own enum value verbatim. Core
 * holds no domain types — the rule `queue.messages.ts` states for a message holds for a
 * node too, and for the same reason: it outlives the process that wrote it.
 */
export interface ScrapingStatusSnapshot {
  status: string;
  /** Every row of the item. */
  total: number;
  completed: number;
  failed: number;
  /** Queued or in flight — what is still owed. */
  pending: number;
}

/** One row, as the chapter table reads it. `index` saves the screen a lookup to name it. */
export interface ScrapingContentRow {
  contentId: string;
  status: string;
  index: number;
}

/**
 * The live scraping status, mirrored where the browser can subscribe to it.
 *
 * Firestore holds the truth; this is a derived tree the screen watches so a job that
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
 * In core rather than in the library module, for `ContentFileProvider`'s reason: writing
 * to a store is not a domain concept, and the next thing worth watching will not be a
 * scraping job.
 */
@Injectable()
export class RealtimeProvider {
  private readonly logger = new Logger(RealtimeProvider.name);

  constructor(private readonly firebase: FirebaseAdminService) {}

  /** What the item's badge and counters read. Stamped, so a node can be recognised as stale. */
  async publishItem(itemId: string, snapshot: ScrapingStatusSnapshot): Promise<void> {
    await this.attempt(`the status of ${itemId}`, () => this.itemRef(itemId).update({ ...snapshot, updatedAt: Date.now() }));
  }

  /**
   * The whole claimed set, in as few round trips as it takes.
   *
   * Chunked because a novel is a thousand rows and this is the one burst in the job —
   * everything after it is a row at a time. A chunk that fails is logged and the rest
   * still go: a partial subtree draws a partly live table, which beats none.
   */
  async publishQueued(itemId: string, rows: ScrapingContentRow[]): Promise<void> {
    for (let from = 0; from < rows.length; from += UPDATE_CHUNK) {
      const chunk = rows.slice(from, from + UPDATE_CHUNK);
      const fields: Record<string, unknown> = {};

      chunk.forEach((row) => {
        fields[row.contentId] = nodeOf(row);
      });

      await this.attempt(`${chunk.length} queued row(s) of ${itemId}`, () => this.contentsRef(itemId).update(fields));
    }
  }

  /**
   * One row moving — what flips a badge in the chapter table.
   *
   * The status alone, and `update` rather than `set`: `publishQueued` wrote the row's
   * `index` when the job claimed it, and a transition has no business rewriting it.
   * That is also what keeps this off a Firestore read — the caller knows which row
   * moved and where to, and needs to know nothing else about it.
   */
  async publishContent(itemId: string, contentId: string, status: string): Promise<void> {
    await this.attempt(`row ${contentId} of ${itemId}`, () => this.contentsRef(itemId).child(contentId).update({ status }));
  }

  /**
   * The per-row subtree, once the job it described is over.
   *
   * The summary deliberately stays: it is what tells the screen the job has settled, and
   * removing it in the same breath would race the client that is watching for exactly
   * that transition.
   */
  async clearContents(itemId: string): Promise<void> {
    await this.attempt(`the rows of ${itemId}`, () => this.contentsRef(itemId).remove());
  }

  /**
   * Everything about an item, for an item that is gone.
   *
   * One update at the root rather than two removes, so the two subtrees cannot half-go.
   */
  async clear(itemId: string): Promise<void> {
    const fields = {
      [`${SCRAPING_ROOT}/items/${itemId}`]: null,
      [`${SCRAPING_ROOT}/contents/${itemId}`]: null,
    };

    await this.attempt(`everything about ${itemId}`, () => this.firebase.database.ref().update(fields));
  }

  private itemRef(itemId: string): Reference {
    return this.firebase.database.ref(`${SCRAPING_ROOT}/items/${itemId}`);
  }

  private contentsRef(itemId: string): Reference {
    return this.firebase.database.ref(`${SCRAPING_ROOT}/contents/${itemId}`);
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

/** A row as it is stored: what the badge needs, and what names it. */
function nodeOf(row: ScrapingContentRow): { status: string; index: number } {
  return { status: row.status, index: row.index };
}
