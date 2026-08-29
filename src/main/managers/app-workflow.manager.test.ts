import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppWorkflowManager } from './app-workflow.manager';
import { createTestDb } from '../database/test-db';
import { seedLibrary, seedWorkflow } from '../database/test-fixtures';
import { createMessageBus, type MessageBus } from '../queue/message-bus';
import { QUEUE_NAMES } from '../queue/queue-names';
import { createAppWorkflowHistoryEntry, listAppWorkflowHistoryEntries } from '../database/repositories/app-workflow-history.repo';
import { markWorkflowRunEnded, markWorkflowRunStarted } from '../queue/workflow-run-tracker';
import type { Db } from '../database/client';
import { AppLibraryType } from '../../shared/app-library';
import { AppWorkflowRunStatus } from '../../shared/app-workflow-history';
import { AppWorkflowStatus } from '../../shared/app-workflow';

vi.mock('../helpers/workflow-export', () => ({ deleteWorkflowExport: vi.fn() }));

let db: Db;
let bus: MessageBus;

beforeEach(() => {
  db = createTestDb();
  bus = createMessageBus();
  vi.clearAllMocks();
});

describe('app workflow manager', () => {
  it('create() throws for a library item that does not exist', () => {
    const manager = createAppWorkflowManager(db, bus);
    expect(() => manager.create({ name: 'x', description: '', libraryId: 'missing' })).toThrow(/not found/);
  });

  it('create() denormalizes the library type/title and defaults status to draft', () => {
    const library = seedLibrary(db, AppLibraryType.Novel, { title: 'My Novel' });
    const manager = createAppWorkflowManager(db, bus);

    const workflow = manager.create({ name: 'Wf', description: 'desc', libraryId: library.id });

    expect(workflow).toMatchObject({ name: 'Wf', description: 'desc', status: AppWorkflowStatus.Draft, libraryId: library.id, libraryType: AppLibraryType.Novel, libraryTitle: 'My Novel' });
    expect(manager.get(workflow.id)).toEqual(workflow);
  });

  it('list() filters by status', () => {
    const manager = createAppWorkflowManager(db, bus);
    seedWorkflow(db, { status: AppWorkflowStatus.Draft });
    seedWorkflow(db, { status: AppWorkflowStatus.Active });

    expect(manager.list()).toHaveLength(2);
    expect(manager.list({ status: AppWorkflowStatus.Active })).toHaveLength(1);
  });

  it('update() merges partial input, leaving the library reference untouched', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowManager(db, bus);

    const updated = manager.update(workflow.id, { name: 'New Name' });

    expect(updated.name).toBe('New Name');
    expect(updated.libraryId).toBe(workflow.libraryId);
  });

  it('update() throws for a workflow that does not exist', () => {
    const manager = createAppWorkflowManager(db, bus);
    expect(() => manager.update('missing', { name: 'x' })).toThrow(/not found/);
  });

  it('remove() deletes the workflow, cascades its history, and clears its export', async () => {
    const { deleteWorkflowExport } = await import('../helpers/workflow-export');
    const workflow = seedWorkflow(db);
    createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-1', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Success, range: null, startedAt: Date.now() });
    const manager = createAppWorkflowManager(db, bus);

    manager.remove(workflow.id);

    expect(manager.get(workflow.id)).toBeUndefined();
    expect(deleteWorkflowExport).toHaveBeenCalledWith(workflow.id);
  });

  it('remove() throws for a workflow that does not exist', () => {
    const manager = createAppWorkflowManager(db, bus);
    expect(() => manager.remove('missing')).toThrow(/not found/);
  });

  it('execute() sets the workflow running and publishes a run-requested message', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowManager(db, bus);
    const received: unknown[] = [];
    bus.subscribe(QUEUE_NAMES.workflowRunRequested, (message) => received.push(message.payload));

    manager.execute(workflow.id);

    expect(manager.get(workflow.id)?.status).toBe(AppWorkflowStatus.Running);
    expect(received).toEqual([{ workflowId: workflow.id }]);
  });

  it('execute() throws when the workflow is genuinely running in this process', () => {
    const workflow = seedWorkflow(db, { status: AppWorkflowStatus.Running });
    const manager = createAppWorkflowManager(db, bus);
    markWorkflowRunStarted(workflow.id);

    try {
      expect(() => manager.execute(workflow.id)).toThrow(/already running/);
    } finally {
      markWorkflowRunEnded(workflow.id);
    }
  });

  it('execute() resets a workflow left running by an interrupted run and starts a fresh one', () => {
    const workflow = seedWorkflow(db, { status: AppWorkflowStatus.Running });
    const stuck = createAppWorkflowHistoryEntry(db, { workflowId: workflow.id, runId: 'run-1', activityId: null, activityName: null, activityType: null, status: AppWorkflowRunStatus.Running, range: null, startedAt: Date.now() });
    const manager = createAppWorkflowManager(db, bus);
    const received: unknown[] = [];
    bus.subscribe(QUEUE_NAMES.workflowRunRequested, (message) => received.push(message.payload));

    manager.execute(workflow.id);

    expect(manager.get(workflow.id)?.status).toBe(AppWorkflowStatus.Running);
    expect(received).toEqual([{ workflowId: workflow.id }]);
    const settled = listAppWorkflowHistoryEntries(db, workflow.id).find((entry) => entry.id === stuck.id);
    expect(settled?.status).toBe(AppWorkflowRunStatus.Failed);
    expect(settled?.error).toMatch(/interrupted/i);
  });

  it('execute() throws for a workflow that does not exist', () => {
    const manager = createAppWorkflowManager(db, bus);
    expect(() => manager.execute('missing')).toThrow(/not found/);
  });
});
