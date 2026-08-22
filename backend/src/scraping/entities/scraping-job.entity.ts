import { FirestoreEntity } from '../../core/firebase/firestore.repository';
import { LibraryItemType } from '../../library/entities/library-item.entity';

/** The possible statuses of a scraping job. */
export enum ScrapingJobStatus {
  Scheduled = 'scheduled',
  Queued = 'queued',
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

/** A scraping job. */
export interface ScrapingJob extends FirestoreEntity {
  id: string;
  libraryId: string;
  libraryType: LibraryItemType;
  libraryTitle: string;
  crawler: string;
  status: ScrapingJobStatus;
  range: string;
  refetch: boolean;
  retry: number;
  startAt: string | null;
  queuedAt: string | null;
  completedAt: string | null;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  createdAt: string;
  updatedAt: string;
}

/** A scraping task. */
export interface ScrapingTask extends FirestoreEntity {
  id: string;
  contentId: string;
  libraryId: string;
  index: number;
  sourceUrl: string;
  status: ScrapingJobStatus;
  refetch: boolean;
  retry: number;
  startAt: string | null;
  completedAt: string | null;
  error: string | null;
}
