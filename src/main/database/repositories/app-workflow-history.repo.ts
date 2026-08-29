import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import { AppWorkflowRunStatus, type AppWorkflowHistoryEntry } from '../../../shared/app-workflow-history';
import type { AppWorkflowActivityType } from '../../../shared/app-workflow-activity';

interface AppWorkflowHistoryRow {
  id: string;
  workflow_id: string;
  run_id: string;
  activity_id: string | null;
  activity_name: string | null;
  activity_type: string | null;
  status: string;
  range: string | null;
  error: string | null;
  started_at: number;
  ended_at: number | null;
  duration: number | null;
  created_at: number;
  updated_at: number;
}

/** What the repository writes when an entry (run overview or activity run) starts. */
export interface AppWorkflowHistoryDraft {
  workflowId: string;
  runId: string;
  activityId: string | null;
  activityName: string | null;
  activityType: AppWorkflowActivityType | null;
  status: AppWorkflowRunStatus;
  range: string | null;
  startedAt: number;
}

/** What the repository patches once an entry settles. */
export interface AppWorkflowHistoryPatch {
  status: AppWorkflowRunStatus;
  endedAt: number;
  duration: number;
  error: string | null;
}

function toAppWorkflowHistoryEntry(row: AppWorkflowHistoryRow): AppWorkflowHistoryEntry {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    runId: row.run_id,
    activityId: row.activity_id,
    activityName: row.activity_name,
    activityType: row.activity_type as AppWorkflowActivityType | null,
    status: row.status as AppWorkflowRunStatus,
    range: row.range,
    error: row.error,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    duration: row.duration,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppWorkflowHistoryEntry(db: Db, id: string): AppWorkflowHistoryEntry | undefined {
  const row = db.prepare('SELECT * FROM app_workflow_history WHERE id = ?').get(id) as AppWorkflowHistoryRow | undefined;
  return row ? toAppWorkflowHistoryEntry(row) : undefined;
}

export function listAppWorkflowHistoryEntries(db: Db, workflowId: string): AppWorkflowHistoryEntry[] {
  const rows = db.prepare('SELECT * FROM app_workflow_history WHERE workflow_id = ? ORDER BY started_at DESC').all(workflowId) as unknown as AppWorkflowHistoryRow[];
  return rows.map(toAppWorkflowHistoryEntry);
}

export function createAppWorkflowHistoryEntry(db: Db, draft: AppWorkflowHistoryDraft): AppWorkflowHistoryEntry {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO app_workflow_history (id, workflow_id, run_id, activity_id, activity_name, activity_type, status, range, error, started_at, ended_at, duration, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)`,
  ).run(id, draft.workflowId, draft.runId, draft.activityId, draft.activityName, draft.activityType, draft.status, draft.range, draft.startedAt, now, now);

  return getAppWorkflowHistoryEntry(db, id)!;
}

export function settleAppWorkflowHistoryEntry(db: Db, id: string, patch: AppWorkflowHistoryPatch): AppWorkflowHistoryEntry {
  db.prepare(
    `UPDATE app_workflow_history SET status = ?, ended_at = ?, duration = ?, error = ?, updated_at = ? WHERE id = ?`,
  ).run(patch.status, patch.endedAt, patch.duration, patch.error, Date.now(), id);

  return getAppWorkflowHistoryEntry(db, id)!;
}

/** Cascades a workflow's deletion — there is no DB-level foreign key, so the manager calls this explicitly. */
export function deleteAppWorkflowHistoryByWorkflowId(db: Db, workflowId: string): void {
  db.prepare('DELETE FROM app_workflow_history WHERE workflow_id = ?').run(workflowId);
}

/** Settles every entry a workflow's interrupted run left stuck at `running` (the overview row and whichever activity was mid-flight) as `failed`, so re-running it starts from a clean history instead of a run that can never finish. */
export function settleStaleAppWorkflowHistoryEntries(db: Db, workflowId: string, error: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE app_workflow_history SET status = ?, ended_at = ?, duration = ? - started_at, error = ?, updated_at = ? WHERE workflow_id = ? AND status = ?`,
  ).run(AppWorkflowRunStatus.Failed, now, now, error, now, workflowId, AppWorkflowRunStatus.Running);
}
