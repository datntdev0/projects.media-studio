import { Injectable } from '@nestjs/common';
import { CollectionReference, Query, Timestamp } from 'firebase-admin/firestore';
import { iso } from '../_shared/helper';
import { SCRAPING_JOB_COLLECTION, TASK_SUBCOLLECTION } from '../core/firebase/collections';
import { FirebaseAdminService } from '../core/firebase/firebase-admin.service';
import { entityFrom, FirestoreRepository } from '../core/firebase/firestore.repository';
import { LibraryItemType } from '../library/entities/library-item.entity';
import { ScrapingJob, ScrapingJobStatus, ScrapingTask } from './entities/scraping-job.entity';

/** How many writes fit in one Firestore batch. */
const BATCH_LIMIT = 500;

/** The states a job still owes an answer for — what `pending` counts. */
const OWED_STATUSES = [ScrapingJobStatus.Scheduled, ScrapingJobStatus.Queued, ScrapingJobStatus.Running];

/** The two a person put a task in. Neither is owed, and neither is finished. */
const HALTED_STATUSES = [ScrapingJobStatus.Paused, ScrapingJobStatus.Stopped];

/** What narrows a search. Nothing else does — see the GET's query table. */
export interface ScrapingJobFilter {
  statuses?: ScrapingJobStatus[];
  libraryType?: LibraryItemType;
  libraryId?: string;
  dueBy?: Date;
}

/** What one pass over a job's tasks says about it. */
export interface ScrapingTaskCounts {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  halted: number;
}

/** The few fields a runner writes as a job goes. Everything else is settled at creation. */
export interface ScrapingJobPatch {
  status?: ScrapingJobStatus;
  queuedAt?: string;
  completedAt?: string;
  completed?: number;
  failed?: number;
}

/** Likewise for one task. */
export interface ScrapingTaskPatch {
  status?: ScrapingJobStatus;
  startAt?: string;
  completedAt?: string;
  error?: string | null;
}

/** A job as a caller hands it over — the id and the dates are this class's to stamp. */
export type ScrapingJobDraft = Omit<ScrapingJob, 'id' | 'createdAt' | 'updatedAt'>;

/** A task as a caller hands it over — its id is its `contentId`. */
export type ScrapingTaskDraft = Omit<ScrapingTask, 'id'>;

/**
 * The scraping job records, and the `tasks` subcollection filed under each one.
 *
 * The only file that mentions Firestore for this feature — the managers above it
 * work in jobs, drafts and rows, and would not change if the store did. Extends
 * the shared base for the job collection itself; the `tasks` subcollection, which
 * the base knows nothing of, is this class's own — the same split as
 * `library.repository.ts`'s `contents`.
 */
@Injectable()
export class ScrapingRepository extends FirestoreRepository<ScrapingJob> {
  protected readonly collectionName = SCRAPING_JOB_COLLECTION;

  constructor(firebase: FirebaseAdminService) {
    super(firebase);
  }

  async findScrapingJob(id: string): Promise<ScrapingJob | null> {
    return this.findById(id);
  }

  /**
   * The jobs matching the filter, unordered and unpaged.
   *
   * Equality filters with no `orderBy` are served by merging the automatic
   * single-field indexes, so no composite index is needed for any combination of
   * them — `dueBy` is the one exception, noted on `ScrapingJobFilter`.
   */
  async searchJobs(filter: ScrapingJobFilter): Promise<ScrapingJob[]> {
    let query: Query = this.collection;

    if (filter.statuses?.length) {
      query = query.where('status', 'in', filter.statuses);
    }

    if (filter.libraryType) {
      query = query.where('libraryType', '==', filter.libraryType);
    }

    if (filter.libraryId) {
      query = query.where('libraryId', '==', filter.libraryId);
    }

    if (filter.dueBy) {
      query = query.where('startAt', '<=', filter.dueBy.toISOString());
    }

    const snapshot = await query.get();

    // A query answers with documents that exist, so none of these maps to null.
    return snapshot.docs.map((document) => entityFrom<ScrapingJob>(document)!);
  }

  /** Creates a new scraping job document from the given draft. */
  async createJob(draft: ScrapingJobDraft): Promise<ScrapingJob> {
    const document = this.collection.doc();
    const now = Timestamp.now();

    await document.set({ ...draft, createdAt: now, updatedAt: now });

    return { ...draft, id: document.id, createdAt: iso(now), updatedAt: iso(now) };
  }

  /**
   * The few fields a run moves. Not `update`: a runner holds none of the rest, and
   * answering with the whole record would cost a re-read nobody asked for.
   */
  async updateJob(id: string, fields: ScrapingJobPatch): Promise<void> {
    await this.collection.doc(id).update({ ...fields, updatedAt: Timestamp.now() });
  }

  async deleteJob(id: string): Promise<void> {
    const tasks = this.tasksOf(id);

    for (;;) {
      const snapshot = await tasks.limit(BATCH_LIMIT).get();

      if (snapshot.empty) {
        break;
      }

      const batch = this.firestore.batch();

      snapshot.docs.forEach((document) => batch.delete(document.ref));

      await batch.commit();
    }

    await this.delete(id);
  }

  /**
   * A booked job, taken — or null where somebody else took it.
   *
   * The read and the write are one act, so a second instance ticking at the same
   * second sees the job it did not get rather than publishing it twice.
   */
  async claimJob(id: string): Promise<ScrapingJob | null> {
    const reference = this.collection.doc(id);

    return this.firestore.runTransaction(async (transaction) => {
      const job = entityFrom<ScrapingJob>(await transaction.get(reference));

      if (!job || job.status !== ScrapingJobStatus.Scheduled) {
        return null;
      }

      transaction.update(reference, { status: ScrapingJobStatus.Queued, updatedAt: Timestamp.now() });

      return { ...job, status: ScrapingJobStatus.Queued };
    });
  }

  /** One job's tasks, in reading order. */
  async getTasks(jobId: string): Promise<ScrapingTask[]> {
    const snapshot = await this.tasksOf(jobId).orderBy('index').get();

    return snapshot.docs.map((document) => entityFrom<ScrapingTask>(document)!);
  }

  async getTask(jobId: string, contentId: string): Promise<ScrapingTask | null> {
    return entityFrom<ScrapingTask>(await this.tasksOf(jobId).doc(contentId).get());
  }

  /** One document per piece of content in range. Batched, because a novel is a thousand of them. */
  async createTasks(jobId: string, drafts: ScrapingTaskDraft[]): Promise<void> {
    const tasks = this.tasksOf(jobId);

    for (let from = 0; from < drafts.length; from += BATCH_LIMIT) {
      const batch = this.firestore.batch();

      drafts.slice(from, from + BATCH_LIMIT).forEach((draft) => batch.set(tasks.doc(draft.contentId), draft));

      await batch.commit();
    }
  }

  async patchTask(jobId: string, contentId: string, fields: ScrapingTaskPatch): Promise<void> {
    await this.tasksOf(jobId).doc(contentId).update({ ...fields });
  }

  async startTask(jobId: string, contentId: string, at: string): Promise<void> {
    const batch = this.firestore.batch();

    batch.update(this.collection.doc(jobId), { status: ScrapingJobStatus.Running, updatedAt: Timestamp.now() });
    batch.update(this.tasksOf(jobId).doc(contentId), { status: ScrapingJobStatus.Running, startAt: at });

    await batch.commit();
  }

  async completeTask(jobId: string, contentId: string, at: string): Promise<void> {
    await this.tasksOf(jobId).doc(contentId).update({ status: ScrapingJobStatus.Completed, completedAt: at, error: null });
  }

  /** The status of many tasks at once, for a publish. Batched, as `createTasks` is. */
  async setTaskStatus(jobId: string, contentIds: string[], status: ScrapingJobStatus): Promise<void> {
    const tasks = this.tasksOf(jobId);

    for (let from = 0; from < contentIds.length; from += BATCH_LIMIT) {
      const batch = this.firestore.batch();

      contentIds.slice(from, from + BATCH_LIMIT).forEach((contentId) => batch.update(tasks.doc(contentId), { status }));

      await batch.commit();
    }
  }

  /**
   * What the job's counters are made of, as aggregations rather than reads — so a
   * job of twelve hundred tasks costs what one of twelve does, and a counter that
   * is recomputed cannot drift.
   */
  async countTasks(jobId: string): Promise<ScrapingTaskCounts> {
    const tasks = this.tasksOf(jobId);

    const [total, completed, failed, pending, halted] = await Promise.all([
      tasks.count().get(),
      tasks.where('status', '==', ScrapingJobStatus.Completed).count().get(),
      tasks.where('status', '==', ScrapingJobStatus.Failed).count().get(),
      tasks.where('status', 'in', OWED_STATUSES).count().get(),
      tasks.where('status', 'in', HALTED_STATUSES).count().get(),
    ]);

    return {
      total: total.data().count,
      completed: completed.data().count,
      failed: failed.data().count,
      pending: pending.data().count,
      halted: halted.data().count,
    };
  }

  private tasksOf(jobId: string): CollectionReference {
    return this.collection.doc(jobId).collection(TASK_SUBCOLLECTION);
  }
}
