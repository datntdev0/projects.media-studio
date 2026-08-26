import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import type { AppLibraryType } from '../../../shared/app-library';
import type { ScrapingJob, ScrapingJobDraft, ScrapingJobStatus, ScrapingTask } from '../../../shared/app-scraping';

interface ScrapingJobRow {
  id: string;
  library_id: string;
  library_type: string;
  library_title: string;
  crawler: string;
  status: string;
  range: string;
  refetch: number;
  retry: number;
  start_at: number | null;
  queued_at: number | null;
  completed_at: number | null;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  tasks: string;
  created_at: number;
  updated_at: number;
}

/** What narrows a search — equality-only, so no composite index is needed. */
export interface ScrapingJobFilter {
  statuses?: readonly ScrapingJobStatus[];
  libraryType?: AppLibraryType;
  libraryId?: string;
}

function toScrapingJob(row: ScrapingJobRow): ScrapingJob {
  return {
    id: row.id,
    libraryId: row.library_id,
    libraryType: row.library_type as AppLibraryType,
    libraryTitle: row.library_title,
    crawler: row.crawler,
    status: row.status as ScrapingJobStatus,
    range: row.range,
    refetch: row.refetch === 1,
    retry: row.retry,
    startAt: row.start_at,
    queuedAt: row.queued_at,
    completedAt: row.completed_at,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    skipped: row.skipped,
    tasks: JSON.parse(row.tasks) as ScrapingTask[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getScrapingJob(db: Db, id: string): ScrapingJob | undefined {
  const row = db.prepare('SELECT * FROM scraping_jobs WHERE id = ?').get(id) as ScrapingJobRow | undefined;
  return row ? toScrapingJob(row) : undefined;
}

export function listScrapingJobs(db: Db, filter: ScrapingJobFilter = {}): ScrapingJob[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filter.statuses?.length) {
    clauses.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.libraryType) {
    clauses.push('library_type = ?');
    params.push(filter.libraryType);
  }
  if (filter.libraryId) {
    clauses.push('library_id = ?');
    params.push(filter.libraryId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM scraping_jobs ${where} ORDER BY created_at DESC`).all(...params) as unknown as ScrapingJobRow[];

  return rows.map(toScrapingJob);
}

export function createScrapingJob(db: Db, draft: ScrapingJobDraft): ScrapingJob {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO scraping_jobs
     (id, library_id, library_type, library_title, crawler, status, range, refetch, retry, start_at, queued_at, completed_at, total, completed, failed, skipped, tasks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    draft.libraryId,
    draft.libraryType,
    draft.libraryTitle,
    draft.crawler,
    draft.status,
    draft.range,
    draft.refetch ? 1 : 0,
    draft.retry,
    draft.startAt,
    draft.queuedAt,
    draft.completedAt,
    draft.total,
    draft.completed,
    draft.failed,
    draft.skipped,
    JSON.stringify(draft.tasks),
    now,
    now,
  );

  return getScrapingJob(db, id)!;
}

export function updateScrapingJob(db: Db, id: string, draft: ScrapingJobDraft): ScrapingJob {
  db.prepare(
    `UPDATE scraping_jobs
     SET library_id = ?, library_type = ?, library_title = ?, crawler = ?, status = ?, range = ?, refetch = ?, retry = ?,
         start_at = ?, queued_at = ?, completed_at = ?, total = ?, completed = ?, failed = ?, skipped = ?, tasks = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    draft.libraryId,
    draft.libraryType,
    draft.libraryTitle,
    draft.crawler,
    draft.status,
    draft.range,
    draft.refetch ? 1 : 0,
    draft.retry,
    draft.startAt,
    draft.queuedAt,
    draft.completedAt,
    draft.total,
    draft.completed,
    draft.failed,
    draft.skipped,
    JSON.stringify(draft.tasks),
    Date.now(),
    id,
  );

  return getScrapingJob(db, id)!;
}

export function deleteScrapingJob(db: Db, id: string): void {
  db.prepare('DELETE FROM scraping_jobs WHERE id = ?').run(id);
}
