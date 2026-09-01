import { randomUUID } from 'node:crypto';
import type { Db } from '@/main/database/client';
import { WorkspaceStepState, type WorkspaceStepCounts, type WorkspaceStepKey } from '@/shared/app-workspace';
import { ACTIVE_RUN_STATUSES, type AppWorkspaceRun, type AppWorkspaceRunDraft, type AppWorkspaceRunEdit, type WorkspaceRunMode, type WorkspaceRunStep, type WorkspaceRunStepPlan, type WorkspaceRunStatus } from '@/shared/app-workspace-run';

interface AppWorkspaceRunRow {
  id: string;
  workspace_id: string;
  seq: number;
  mode: string;
  status: string;
  from_chapter: number;
  to_chapter: number;
  steps: string;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
}

interface StepCountRow {
  run_id: string;
  step_key: string;
  state: string;
  tally: number;
}

const NO_COUNTS: WorkspaceStepCounts = { doneCount: 0, failedCount: 0, totalCount: 0 };

/** A sub-step the orchestrator has still to work. */
export interface PendingActivity {
  id: string;
  subStepNo: number;
}

function countsKey(runId: string, stepKey: string): string {
  return `${runId}:${stepKey}`;
}

/**
 * Each step's progress, tallied over its sub-step rows in one query — a step
 * stores no counts of its own, so this is where they come from.
 */
function countsByStep(db: Db, runIds: string[]): Map<string, WorkspaceStepCounts> {
  const counts = new Map<string, WorkspaceStepCounts>();
  if (runIds.length === 0) return counts;

  const placeholders = runIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT run_id, step_key, state, COUNT(*) AS tally FROM app_workspace_activities WHERE run_id IN (${placeholders}) GROUP BY run_id, step_key, state`)
    .all(...runIds) as unknown as StepCountRow[];

  for (const row of rows) {
    const key = countsKey(row.run_id, row.step_key);
    const current = counts.get(key) ?? { ...NO_COUNTS };
    if (row.state === WorkspaceStepState.Done) current.doneCount += row.tally;
    if (row.state === WorkspaceStepState.Failed) current.failedCount += row.tally;
    current.totalCount += row.tally;
    counts.set(key, current);
  }

  return counts;
}

function toRun(row: AppWorkspaceRunRow, counts: Map<string, WorkspaceStepCounts>): AppWorkspaceRun {
  const plans = JSON.parse(row.steps) as WorkspaceRunStepPlan[];
  const steps: WorkspaceRunStep[] = plans
    .map((plan) => ({ ...plan, ...(counts.get(countsKey(row.id, plan.stepKey)) ?? NO_COUNTS) }))
    .sort((left, right) => left.idx - right.idx);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    seq: row.seq,
    mode: row.mode as WorkspaceRunMode,
    status: row.status as WorkspaceRunStatus,
    fromChapter: row.from_chapter,
    toChapter: row.to_chapter,
    steps,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrate(db: Db, rows: AppWorkspaceRunRow[]): AppWorkspaceRun[] {
  const counts = countsByStep(db, rows.map((row) => row.id));
  return rows.map((row) => toRun(row, counts));
}

/** The next label for this workspace — runs are numbered per workspace, from 1. */
function nextSeq(db: Db, workspaceId: string): number {
  const row = db.prepare('SELECT MAX(seq) AS max_seq FROM app_workspace_runs WHERE workspace_id = ?').get(workspaceId) as { max_seq: number | null };
  return (row.max_seq ?? 0) + 1;
}

export function getAppWorkspaceRun(db: Db, id: string): AppWorkspaceRun | undefined {
  const row = db.prepare('SELECT * FROM app_workspace_runs WHERE id = ?').get(id) as AppWorkspaceRunRow | undefined;
  return row ? hydrate(db, [row])[0] : undefined;
}

/** One workspace's runs, newest first. */
export function listAppWorkspaceRuns(db: Db, workspaceId: string): AppWorkspaceRun[] {
  const rows = db.prepare('SELECT * FROM app_workspace_runs WHERE workspace_id = ? ORDER BY seq DESC').all(workspaceId) as unknown as AppWorkspaceRunRow[];
  return hydrate(db, rows);
}

/** Every unfinished run of every workspace, oldest first — the scheduler's working set. */
export function listActiveAppWorkspaceRuns(db: Db): AppWorkspaceRun[] {
  const placeholders = ACTIVE_RUN_STATUSES.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM app_workspace_runs WHERE status IN (${placeholders}) ORDER BY created_at`)
    .all(...ACTIVE_RUN_STATUSES) as unknown as AppWorkspaceRunRow[];
  return hydrate(db, rows);
}

/** The run, its step plan and every sub-step row it covers — one transaction, since a half-written run has no meaning. */
export function createAppWorkspaceRun(db: Db, draft: AppWorkspaceRunDraft): AppWorkspaceRun {
  const id = randomUUID();
  const now = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO app_workspace_runs (id, workspace_id, seq, mode, status, from_chapter, to_chapter, steps, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, draft.workspaceId, nextSeq(db, draft.workspaceId), draft.mode, draft.status, draft.fromChapter, draft.toChapter, JSON.stringify(draft.steps), draft.startedAt, now, now);

    const insert = db.prepare(
      `INSERT INTO app_workspace_activities (id, run_id, step_key, sub_step_no, state, attempt, error, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, NULL, NULL, NULL, ?, ?)`,
    );
    for (const activity of draft.activities) {
      insert.run(randomUUID(), id, activity.stepKey, activity.subStepNo, WorkspaceStepState.Pending, now, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getAppWorkspaceRun(db, id)!;
}

export function updateAppWorkspaceRun(db: Db, id: string, edit: AppWorkspaceRunEdit): AppWorkspaceRun {
  db.prepare('UPDATE app_workspace_runs SET status = ?, steps = ?, started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?').run(
    edit.status,
    JSON.stringify(edit.steps),
    edit.startedAt,
    edit.endedAt,
    Date.now(),
    id,
  );
  return getAppWorkspaceRun(db, id)!;
}

/**
 * How much of the novel one workspace has worked for one step: distinct sub-steps
 * counted over every run of that workspace, so progress accumulates across runs
 * rather than resetting with each range. `totalCount` is the sub-steps that exist
 * at all — the caller decides whether the novel's own chapter count outranks it.
 */
export function countWorkspaceStepProgress(db: Db, workspaceId: string, stepKey: WorkspaceStepKey): WorkspaceStepCounts {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT CASE WHEN a.state = ? THEN a.sub_step_no END) AS done_tally,
              COUNT(DISTINCT CASE WHEN a.state = ? THEN a.sub_step_no END) AS failed_tally,
              COUNT(DISTINCT a.sub_step_no) AS total_tally
       FROM app_workspace_activities a
       JOIN app_workspace_runs r ON r.id = a.run_id
       WHERE r.workspace_id = ? AND a.step_key = ?`,
    )
    .get(WorkspaceStepState.Done, WorkspaceStepState.Failed, workspaceId, stepKey) as { done_tally: number; failed_tally: number; total_tally: number };

  return { doneCount: row.done_tally, failedCount: row.failed_tally, totalCount: row.total_tally };
}

/** A run's status without hydrating it — the orchestrator re-checks this between sub-steps. */
export function getAppWorkspaceRunStatus(db: Db, id: string): WorkspaceRunStatus | undefined {
  const row = db.prepare('SELECT status FROM app_workspace_runs WHERE id = ?').get(id) as { status: string } | undefined;
  return row ? (row.status as WorkspaceRunStatus) : undefined;
}

/** One step's sub-steps still to be worked, in the order they run. */
export function listPendingAppWorkspaceActivities(db: Db, runId: string, stepKey: WorkspaceStepKey): PendingActivity[] {
  const rows = db
    .prepare('SELECT id, sub_step_no FROM app_workspace_activities WHERE run_id = ? AND step_key = ? AND state = ? ORDER BY sub_step_no')
    .all(runId, stepKey, WorkspaceStepState.Pending) as unknown as { id: string; sub_step_no: number }[];
  return rows.map((row) => ({ id: row.id, subStepNo: row.sub_step_no }));
}

export function completeAppWorkspaceActivity(db: Db, id: string, startedAt: number, endedAt: number): void {
  db.prepare('UPDATE app_workspace_activities SET state = ?, attempt = 1, started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?').run(
    WorkspaceStepState.Done,
    startedAt,
    endedAt,
    endedAt,
    id,
  );
}

/** Marks every sub-step still waiting as skipped — what cancelling a run leaves behind. */
export function skipPendingAppWorkspaceActivities(db: Db, runId: string, endedAt: number): void {
  db.prepare('UPDATE app_workspace_activities SET state = ?, ended_at = ?, updated_at = ? WHERE run_id = ? AND state IN (?, ?)').run(
    WorkspaceStepState.Skipped,
    endedAt,
    endedAt,
    runId,
    WorkspaceStepState.Pending,
    WorkspaceStepState.Running,
  );
}

/** Both tables at once — there are no foreign keys, so the cascade is spelled out here. */
export function deleteAppWorkspaceRunsByWorkspaceId(db: Db, workspaceId: string): void {
  db.prepare('DELETE FROM app_workspace_activities WHERE run_id IN (SELECT id FROM app_workspace_runs WHERE workspace_id = ?)').run(workspaceId);
  db.prepare('DELETE FROM app_workspace_runs WHERE workspace_id = ?').run(workspaceId);
}
