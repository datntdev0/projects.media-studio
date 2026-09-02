import { randomUUID } from 'node:crypto';
import type { Db } from '@/main/database/client';
import { WorkspaceStepState, type WorkspaceStepCounts, type WorkspaceStepKey } from '@/shared/app-workspace';
import { ACTIVE_RUN_STATUSES, type AppWorkspaceRun, type AppWorkspaceRunDraft, type AppWorkspaceRunEdit, type WorkspaceActivityDraft, type WorkspaceRunMode, type WorkspaceRunStep, type WorkspaceRunStepDraft, type WorkspaceRunStepEdit, type WorkspaceRunStatus } from '@/shared/app-workspace-run';

interface AppWorkspaceRunRow {
  id: string;
  workspace_id: string;
  seq: number;
  mode: string;
  status: string;
  from_chapter: number;
  to_chapter: number;
  started_at: number | null;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
}

interface StepCountRow {
  run_id: string;
  step_key: string;
  done_tally: number;
  failed_tally: number;
}

interface AppWorkspaceRunStepRow {
  id: string;
  run_id: string;
  idx: number;
  step_key: string;
  state: string;
  start_at: number | null;
  retry: number;
  retry_delay: number;
  total_count: number;
  started_at: number | null;
  ended_at: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

/** What a step's history says it got through. */
interface StepTally {
  doneCount: number;
  failedCount: number;
}

const NO_TALLY: StepTally = { doneCount: 0, failedCount: 0 };

function countsKey(runId: string, stepKey: string): string {
  return `${runId}:${stepKey}`;
}

/**
 * One row per sub-step of the history rows it reads, saying how its attempts
 * went — retries append a row per attempt, so a sub-step has to be folded back
 * into one outcome before anything is counted. Callers add their own filter and
 * `GROUP BY` to it.
 */
const SUB_STEP_ATTEMPTS = `SELECT a.run_id, a.step_key, a.sub_step_no,
    COUNT(CASE WHEN a.state = '${WorkspaceStepState.Done}' THEN 1 END) AS done_attempts,
    COUNT(CASE WHEN a.state = '${WorkspaceStepState.Failed}' THEN 1 END) AS failed_attempts
  FROM app_workspace_activities a`;

/** A sub-step counts once: done when any attempt landed, failed only when none did. */
const DONE_SUB_STEPS = 'COUNT(CASE WHEN done_attempts > 0 THEN 1 END)';
const FAILED_SUB_STEPS = 'COUNT(CASE WHEN done_attempts = 0 AND failed_attempts > 0 THEN 1 END)';

/**
 * What each step of these runs got through, tallied over its history rows in one
 * query. A step's own total is on the run, since only its handler knows how many
 * sub-steps it covers.
 */
function talliesByStep(db: Db, runIds: string[]): Map<string, StepTally> {
  const tallies = new Map<string, StepTally>();
  if (runIds.length === 0) return tallies;

  const placeholders = runIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT run_id, step_key, ${DONE_SUB_STEPS} AS done_tally, ${FAILED_SUB_STEPS} AS failed_tally
       FROM (${SUB_STEP_ATTEMPTS} WHERE a.run_id IN (${placeholders}) GROUP BY a.run_id, a.step_key, a.sub_step_no)
       GROUP BY run_id, step_key`,
    )
    .all(...runIds) as unknown as StepCountRow[];

  for (const row of rows) {
    tallies.set(countsKey(row.run_id, row.step_key), { doneCount: row.done_tally, failedCount: row.failed_tally });
  }

  return tallies;
}

function toRunStep(row: AppWorkspaceRunStepRow, tally: StepTally): WorkspaceRunStep {
  return {
    stepKey: row.step_key as WorkspaceStepKey,
    idx: row.idx,
    state: row.state as WorkspaceStepState,
    startAt: row.start_at,
    retries: row.retry,
    retryDelayMinutes: row.retry_delay,
    totalCount: row.total_count,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    error: row.error,
    ...tally,
  };
}

/** The steps of many runs in one query — a listing would otherwise read them run by run. */
function stepsByRun(db: Db, runIds: string[], tallies: Map<string, StepTally>): Map<string, WorkspaceRunStep[]> {
  const grouped = new Map<string, WorkspaceRunStep[]>();
  if (runIds.length === 0) return grouped;

  const placeholders = runIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT * FROM app_workspace_run_steps WHERE run_id IN (${placeholders}) ORDER BY idx`)
    .all(...runIds) as unknown as AppWorkspaceRunStepRow[];

  for (const row of rows) {
    const steps = grouped.get(row.run_id) ?? [];
    steps.push(toRunStep(row, tallies.get(countsKey(row.run_id, row.step_key)) ?? NO_TALLY));
    grouped.set(row.run_id, steps);
  }

  return grouped;
}

function toRun(row: AppWorkspaceRunRow, steps: WorkspaceRunStep[]): AppWorkspaceRun {
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
  const runIds = rows.map((row) => row.id);
  const steps = stepsByRun(db, runIds, talliesByStep(db, runIds));
  return rows.map((row) => toRun(row, steps.get(row.id) ?? []));
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

/** The run and the steps it covers — one transaction, since a run without its steps has no meaning. */
export function createAppWorkspaceRun(db: Db, draft: AppWorkspaceRunDraft): AppWorkspaceRun {
  const id = randomUUID();
  const now = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO app_workspace_runs (id, workspace_id, seq, mode, status, from_chapter, to_chapter, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, draft.workspaceId, nextSeq(db, draft.workspaceId), draft.mode, draft.status, draft.fromChapter, draft.toChapter, draft.startedAt, now, now);

    for (const step of draft.steps) {
      insertRunStep(db, id, step, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getAppWorkspaceRun(db, id)!;
}

function insertRunStep(db: Db, runId: string, step: WorkspaceRunStepDraft, now: number): void {
  db.prepare(
    `INSERT INTO app_workspace_run_steps (id, run_id, idx, step_key, state, start_at, retry, retry_delay, total_count, started_at, ended_at, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
  ).run(randomUUID(), runId, step.idx, step.stepKey, step.state, step.startAt, step.retries, step.retryDelayMinutes, step.totalCount, now, now);
}

/** Appends one worked sub-step to a run's history. */
export function createAppWorkspaceActivity(db: Db, draft: WorkspaceActivityDraft): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO app_workspace_activities (id, run_id, step_key, sub_step_no, state, attempt, error, started_at, ended_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), draft.runId, draft.stepKey, draft.subStepNo, draft.state, draft.attempt, draft.error, draft.startedAt, draft.endedAt, now, now);
}

export function updateAppWorkspaceRun(db: Db, id: string, edit: AppWorkspaceRunEdit): AppWorkspaceRun {
  db.prepare('UPDATE app_workspace_runs SET status = ?, started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?').run(edit.status, edit.startedAt, edit.endedAt, Date.now(), id);
  return getAppWorkspaceRun(db, id)!;
}

export function updateAppWorkspaceRunStep(db: Db, runId: string, stepKey: WorkspaceStepKey, edit: WorkspaceRunStepEdit): void {
  db.prepare('UPDATE app_workspace_run_steps SET state = ?, total_count = ?, started_at = ?, ended_at = ?, error = ?, updated_at = ? WHERE run_id = ? AND step_key = ?').run(
    edit.state,
    edit.totalCount,
    edit.startedAt,
    edit.endedAt,
    edit.error,
    Date.now(),
    runId,
    stepKey,
  );
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
      `SELECT ${DONE_SUB_STEPS} AS done_tally, ${FAILED_SUB_STEPS} AS failed_tally, COUNT(*) AS total_tally
       FROM (${SUB_STEP_ATTEMPTS}
         JOIN app_workspace_runs r ON r.id = a.run_id
         WHERE r.workspace_id = ? AND a.step_key = ?
         GROUP BY a.sub_step_no)`,
    )
    .get(workspaceId, stepKey) as { done_tally: number; failed_tally: number; total_tally: number };

  return { doneCount: row.done_tally, failedCount: row.failed_tally, totalCount: row.total_tally };
}

/** A run's status without hydrating it — the orchestrator re-checks this between sub-steps. */
export function getAppWorkspaceRunStatus(db: Db, id: string): WorkspaceRunStatus | undefined {
  const row = db.prepare('SELECT status FROM app_workspace_runs WHERE id = ?').get(id) as { status: string } | undefined;
  return row ? (row.status as WorkspaceRunStatus) : undefined;
}

/** Every table at once — there are no foreign keys, so the cascade is spelled out here. */
export function deleteAppWorkspaceRunsByWorkspaceId(db: Db, workspaceId: string): void {
  const runsOfWorkspace = 'SELECT id FROM app_workspace_runs WHERE workspace_id = ?';
  db.prepare(`DELETE FROM app_workspace_activities WHERE run_id IN (${runsOfWorkspace})`).run(workspaceId);
  db.prepare(`DELETE FROM app_workspace_run_steps WHERE run_id IN (${runsOfWorkspace})`).run(workspaceId);
  db.prepare('DELETE FROM app_workspace_runs WHERE workspace_id = ?').run(workspaceId);
}
