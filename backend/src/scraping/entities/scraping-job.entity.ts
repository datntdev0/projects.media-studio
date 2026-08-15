import { FirestoreEntity } from '../../core/firebase/firestore.repository';
import { LibraryItemType } from '../../library/entities/library-item.entity';

/**
 * Where a job — or one task of it — has got to. One vocabulary for both, so the
 * aggregate reads as what it is: the state of its parts.
 *
 * Not `LibraryContentStatus`. That one says whether we hold a chapter, which is a
 * question that outlives every job that ever asked it.
 */
export enum ScrapingJobStatus {
  /** Described and booked. Nothing published, and the library untouched. */
  Scheduled = 'scheduled',
  /** Published. Waiting for a consumer — and the one state a consumer will act on. */
  Queued = 'queued',
  /** A consumer has it. */
  Running = 'running',
  Paused = 'paused',
  Stopped = 'stopped',
  Completed = 'completed',
  Failed = 'failed',
}

/** The three a job settles in, and never leaves. What the History tab lists. */
export const TERMINAL_JOB_STATUSES = [ScrapingJobStatus.Stopped, ScrapingJobStatus.Completed, ScrapingJobStatus.Failed] as const;

/** Queued, running or paused — what the Active tab lists. */
export const ACTIVE_JOB_STATUSES = [ScrapingJobStatus.Queued, ScrapingJobStatus.Running, ScrapingJobStatus.Paused] as const;

/**
 * What was asked for, and where it has got to.
 *
 * A historical statement rather than a view of the library: `libraryTitle` and
 * `libraryType` are what the item was called when the job was described, so an item
 * renamed later leaves an old job wearing its old name — which is the honest answer.
 */
export interface ScrapingJob extends FirestoreEntity {
  id: string;
  libraryId: string;
  /** The item's type — what the listing's library filter narrows on. */
  libraryType: LibraryItemType;
  libraryTitle: string;
  /** The item's `sourceName`, carried so a republish needs no read of it. */
  crawler: string;
  status: ScrapingJobStatus;
  /** The expression as it was sent — `all`, `missing`, `23-34`. Drawn verbatim in the panel. */
  range: string;
  refetch: boolean;
  /** How many retries a failed task is allowed. `attemptsFor()` turns it into BullMQ's count. */
  retry: number;
  /** ISO. When the job is due. Null was queued immediately. */
  startAt: string | null;
  /** ISO. When its messages actually went out. */
  queuedAt: string | null;
  /** ISO. When it settled, whichever way. */
  completedAt: string | null;
  /** Tasks in the job. What the progress bar divides by. */
  total: number;
  completed: number;
  failed: number;
  /** Candidates dropped as already complete. */
  skipped: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One piece of content a job was asked to fetch.
 *
 * Filed under the library `contentId`, which is also this document's id: a job
 * scrapes a piece of content at most once, so a consumer reads its task directly
 * rather than querying for it.
 */
export interface ScrapingTask extends FirestoreEntity {
  id: string;
  /** The library content row this task is for, and the document id it is filed under. */
  contentId: string;
  /** Denormalised so a task reads on its own. */
  libraryId: string;
  /** The chapter number — what the subcollection is ordered by. */
  index: number;
  /** Carried so a republish needs no read of the library row. */
  sourceUrl: string;
  status: ScrapingJobStatus;
  /** The job's, copied down: it is what the message carries. */
  refetch: boolean;
  /** The job's, copied down, for the same reason. */
  retry: number;
  /** ISO. When a consumer picked this task up. */
  startAt: string | null;
  /** ISO. */
  completedAt: string | null;
  /** The last failure, in one line. */
  error: string | null;
}
