import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import { AppWorkflowActivityType, type AppWorkflowActivity, type AppWorkflowActivityConfig } from '../../../shared/app-workflow-activity';

interface AppWorkflowActivityRow {
  id: string;
  workflow_id: string;
  type: string;
  name: string;
  description: string;
  x: number;
  y: number;
  enabled: number;
  config: string;
  dependencies: string;
  created_at: number;
  updated_at: number;
}

/** What the repository writes — the id and the dates are its own to stamp. */
export interface AppWorkflowActivityDraft {
  type: AppWorkflowActivityType;
  name: string;
  description: string;
  x: number;
  y: number;
  enabled: boolean;
  config: AppWorkflowActivityConfig;
  dependencies: string[];
}

function toAppWorkflowActivity(row: AppWorkflowActivityRow): AppWorkflowActivity {
  const type = row.type as AppWorkflowActivityType;
  const config = JSON.parse(row.config);

  return {
    id: row.id,
    workflowId: row.workflow_id,
    type,
    name: row.name,
    description: row.description,
    x: row.x,
    y: row.y,
    enabled: row.enabled === 1,
    analyzeConfig: type === AppWorkflowActivityType.Analyze ? config : null,
    translateConfig: type === AppWorkflowActivityType.Translate ? config : null,
    profilesConfig: type === AppWorkflowActivityType.Profiles ? config : null,
    storyboardConfig: type === AppWorkflowActivityType.Storyboard ? config : null,
    ttsConfig: type === AppWorkflowActivityType.Tts ? config : null,
    exportVideoConfig: type === AppWorkflowActivityType.ExportVideo ? config : null,
    dependencies: JSON.parse(row.dependencies),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppWorkflowActivity(db: Db, workflowId: string, id: string): AppWorkflowActivity | undefined {
  const row = db.prepare('SELECT * FROM app_workflow_activities WHERE workflow_id = ? AND id = ?').get(workflowId, id) as AppWorkflowActivityRow | undefined;
  return row ? toAppWorkflowActivity(row) : undefined;
}

export function listAppWorkflowActivities(db: Db, workflowId: string): AppWorkflowActivity[] {
  const rows = db.prepare('SELECT * FROM app_workflow_activities WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as unknown as AppWorkflowActivityRow[];
  return rows.map(toAppWorkflowActivity);
}

export function createAppWorkflowActivity(db: Db, workflowId: string, draft: AppWorkflowActivityDraft): AppWorkflowActivity {
  const id = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO app_workflow_activities (id, workflow_id, type, name, description, x, y, enabled, config, dependencies, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workflowId,
    draft.type,
    draft.name,
    draft.description,
    draft.x,
    draft.y,
    draft.enabled ? 1 : 0,
    JSON.stringify(draft.config),
    JSON.stringify(draft.dependencies),
    now,
    now,
  );

  return getAppWorkflowActivity(db, workflowId, id)!;
}

export function updateAppWorkflowActivity(db: Db, workflowId: string, id: string, draft: AppWorkflowActivityDraft): AppWorkflowActivity {
  db.prepare(
    `UPDATE app_workflow_activities SET name = ?, description = ?, x = ?, y = ?, enabled = ?, config = ?, dependencies = ?, updated_at = ?
     WHERE workflow_id = ? AND id = ?`,
  ).run(
    draft.name,
    draft.description,
    draft.x,
    draft.y,
    draft.enabled ? 1 : 0,
    JSON.stringify(draft.config),
    JSON.stringify(draft.dependencies),
    Date.now(),
    workflowId,
    id,
  );

  return getAppWorkflowActivity(db, workflowId, id)!;
}

export function deleteAppWorkflowActivity(db: Db, workflowId: string, id: string): void {
  db.prepare('DELETE FROM app_workflow_activities WHERE workflow_id = ? AND id = ?').run(workflowId, id);
}

/** Cascades a workflow's deletion — there is no DB-level foreign key, so the manager calls this explicitly. */
export function deleteAppWorkflowActivitiesByWorkflowId(db: Db, workflowId: string): void {
  db.prepare('DELETE FROM app_workflow_activities WHERE workflow_id = ?').run(workflowId);
}
