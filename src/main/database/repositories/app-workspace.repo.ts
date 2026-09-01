import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import type { AppWorkspace, AppWorkspaceDraft, AppWorkspaceEdit, ListAppWorkspacesFilter, WorkspacePreset, WorkspaceStatus, WorkspaceStep, WorkspaceStepKey, WorkspaceStepState } from '../../../shared/app-workspace';

interface AppWorkspaceRow {
  id: string;
  name: string;
  description: string;
  preset: string;
  library_id: string;
  status: string;
  last_run_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AppWorkspaceStepRow {
  id: string;
  workspace_id: string;
  idx: number;
  step_key: string;
  state: string;
  done_count: number;
  failed_count: number;
  total_count: number;
  created_at: number;
  updated_at: number;
}

function toWorkspaceStep(row: AppWorkspaceStepRow): WorkspaceStep {
  return {
    key: row.step_key as WorkspaceStepKey,
    idx: row.idx,
    state: row.state as WorkspaceStepState,
    doneCount: row.done_count,
    failedCount: row.failed_count,
    totalCount: row.total_count,
  };
}

function toAppWorkspace(row: AppWorkspaceRow, steps: WorkspaceStep[]): AppWorkspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    preset: row.preset as WorkspacePreset,
    libraryId: row.library_id,
    status: row.status as WorkspaceStatus,
    steps,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The steps of many workspaces in one query — a listing would otherwise read them workspace by workspace. */
function stepsByWorkspace(db: Db, workspaceIds: string[]): Map<string, WorkspaceStep[]> {
  const grouped = new Map<string, WorkspaceStep[]>();
  if (workspaceIds.length === 0) return grouped;

  const placeholders = workspaceIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM app_workspace_steps WHERE workspace_id IN (${placeholders}) ORDER BY idx`)
    .all(...workspaceIds) as unknown as AppWorkspaceStepRow[];

  for (const row of rows) {
    const steps = grouped.get(row.workspace_id) ?? [];
    steps.push(toWorkspaceStep(row));
    grouped.set(row.workspace_id, steps);
  }

  return grouped;
}

function insertStep(db: Db, workspaceId: string, step: WorkspaceStep, now: number): void {
  db.prepare(
    `INSERT INTO app_workspace_steps (id, workspace_id, idx, step_key, state, done_count, failed_count, total_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), workspaceId, step.idx, step.key, step.state, step.doneCount, step.failedCount, step.totalCount, now, now);
}

export function getAppWorkspace(db: Db, id: string): AppWorkspace | undefined {
  const row = db.prepare('SELECT * FROM app_workspaces WHERE id = ?').get(id) as AppWorkspaceRow | undefined;
  return row ? toAppWorkspace(row, stepsByWorkspace(db, [id]).get(id) ?? []) : undefined;
}

export function listAppWorkspaces(db: Db, filter: ListAppWorkspacesFilter = {}): AppWorkspace[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter.preset) {
    clauses.push('preset = ?');
    params.push(filter.preset);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM app_workspaces ${where} ORDER BY updated_at DESC`).all(...params) as unknown as AppWorkspaceRow[];
  const steps = stepsByWorkspace(db, rows.map((row) => row.id));

  return rows.map((row) => toAppWorkspace(row, steps.get(row.id) ?? []));
}

export function createAppWorkspace(db: Db, draft: AppWorkspaceDraft): AppWorkspace {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO app_workspaces (id, name, description, preset, library_id, status, last_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, draft.name, draft.description, draft.preset, draft.libraryId, draft.status, draft.lastRunAt, now, now);

  for (const step of draft.steps) {
    insertStep(db, id, step, now);
  }

  return getAppWorkspace(db, id)!;
}

/** Rewrites only the editable fields — the pipeline rows and the run state have their own lifecycle. */
export function updateAppWorkspace(db: Db, id: string, edit: AppWorkspaceEdit): AppWorkspace {
  db.prepare('UPDATE app_workspaces SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(edit.name, edit.description, Date.now(), id);
  return getAppWorkspace(db, id)!;
}

export function deleteAppWorkspaceStepsByWorkspaceId(db: Db, workspaceId: string): void {
  db.prepare('DELETE FROM app_workspace_steps WHERE workspace_id = ?').run(workspaceId);
}

export function deleteAppWorkspace(db: Db, id: string): void {
  db.prepare('DELETE FROM app_workspaces WHERE id = ?').run(id);
}
