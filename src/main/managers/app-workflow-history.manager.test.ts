import { beforeEach, describe, expect, it } from 'vitest';
import { createAppWorkflowHistoryManager } from './app-workflow-history.manager';
import { createTestDb } from '../database/test-db';
import { seedWorkflow } from '../database/test-fixtures';
import { createAppWorkflowHistoryEntry, settleAppWorkflowHistoryEntry } from '../database/repositories/app-workflow-history.repo';
import type { Db } from '../database/client';
import { AppWorkflowActivityType } from '../../shared/app-workflow-activity';
import { AppWorkflowRunStatus } from '../../shared/app-workflow-history';

let db: Db;

beforeEach(() => {
  db = createTestDb();
});

describe('app workflow history manager', () => {
  it('listRuns() is empty for a workflow with no history', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowHistoryManager(db);
    expect(manager.listRuns(workflow.id)).toEqual([]);
  });

  it('listRuns() groups a run into its overview entry and its activity entries', () => {
    const workflow = seedWorkflow(db);
    const overview = createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-1', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Running, range: null, startedAt: 100 });
    const activity1 = createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-1', activityId: 'act-1', activityName: 'Analyze', activityType: AppWorkflowActivityType.Analyze, status: AppWorkflowRunStatus.Success, range: 'all', startedAt: 200 });
    const activity2 = createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-1', activityId: 'act-2', activityName: 'Translate', activityType: AppWorkflowActivityType.Translate, status: AppWorkflowRunStatus.Success, range: 'all', startedAt: 300 });
    settleAppWorkflowHistoryEntry(db, overview.id, { status: AppWorkflowRunStatus.Success, endedAt: 400, duration: 300, error: null });

    const manager = createAppWorkflowHistoryManager(db);
    const runs = manager.listRuns(workflow.id);

    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe('run-1');
    expect(runs[0].overview.status).toBe(AppWorkflowRunStatus.Success);
    expect(runs[0].activities.map((entry) => entry.id)).toEqual([activity1.id, activity2.id]);
  });

  it('listRuns() orders multiple runs newest overview first', () => {
    const workflow = seedWorkflow(db);
    createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-older', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Success, range: null, startedAt: 100 });
    createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-newer', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Running, range: null, startedAt: 500 });

    const manager = createAppWorkflowHistoryManager(db);
    const runs = manager.listRuns(workflow.id);

    expect(runs.map((run) => run.runId)).toEqual(['run-newer', 'run-older']);
  });

  it('listRuns() drops a run that has no overview entry', () => {
    const workflow = seedWorkflow(db);
    createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'orphan', activityId: 'act-1', activityName: 'Analyze', activityType: AppWorkflowActivityType.Analyze, status: AppWorkflowRunStatus.Success, range: 'all', startedAt: 100 });

    const manager = createAppWorkflowHistoryManager(db);
    expect(manager.listRuns(workflow.id)).toEqual([]);
  });

  it('listRuns() only returns entries for the requested workflow', () => {
    const workflowA = seedWorkflow(db);
    const workflowB = seedWorkflow(db);
    createAppWorkflowHistoryEntry(db, { workflowId: workflowA.id, runId: 'run-a', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Success, range: null, startedAt: 100 });
    createAppWorkflowHistoryEntry(db, { workflowId: workflowB.id, runId: 'run-b', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Success, range: null, startedAt: 100 });

    const manager = createAppWorkflowHistoryManager(db);
    expect(manager.listRuns(workflowA.id).map((run) => run.runId)).toEqual(['run-a']);
  });
});
