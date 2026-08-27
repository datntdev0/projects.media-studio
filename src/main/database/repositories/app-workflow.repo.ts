import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import type { AppLibraryType } from '../../../shared/app-library';
import type { AppWorkflow, AppWorkflowDraft, AppWorkflowStatus, ListAppWorkflowsFilter } from '../../../shared/app-workflow';

interface AppWorkflowRow {
  id: string;
  name: string;
  description: string;
  status: string;
  library_id: string;
  library_type: string;
  library_title: string;
  created_at: number;
  updated_at: number;
}

function toAppWorkflow(row: AppWorkflowRow): AppWorkflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as AppWorkflowStatus,
    libraryId: row.library_id,
    libraryType: row.library_type as AppLibraryType,
    libraryTitle: row.library_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppWorkflow(db: Db, id: string): AppWorkflow | undefined {
  const row = db.prepare('SELECT * FROM app_workflows WHERE id = ?').get(id) as AppWorkflowRow | undefined;
  return row ? toAppWorkflow(row) : undefined;
}

export function listAppWorkflows(db: Db, filter: ListAppWorkflowsFilter = {}): AppWorkflow[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }

  if (filter.libraryType) {
    clauses.push('library_type = ?');
    params.push(filter.libraryType);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM app_workflows ${where} ORDER BY updated_at DESC`).all(...params) as unknown as AppWorkflowRow[];

  return rows.map(toAppWorkflow);
}

export function createAppWorkflow(db: Db, draft: AppWorkflowDraft): AppWorkflow {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO app_workflows (id, name, description, status, library_id, library_type, library_title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, draft.name, draft.description, draft.status, draft.libraryId, draft.libraryType, draft.libraryTitle, now, now);

  return getAppWorkflow(db, id)!;
}

export function updateAppWorkflow(db: Db, id: string, draft: AppWorkflowDraft): AppWorkflow {
  db.prepare(
    `UPDATE app_workflows
     SET name = ?, description = ?, status = ?, library_id = ?, library_type = ?, library_title = ?, updated_at = ?
     WHERE id = ?`,
  ).run(draft.name, draft.description, draft.status, draft.libraryId, draft.libraryType, draft.libraryTitle, Date.now(), id);

  return getAppWorkflow(db, id)!;
}

export function deleteAppWorkflow(db: Db, id: string): void {
  db.prepare('DELETE FROM app_workflows WHERE id = ?').run(id);
}
