import { beforeEach, describe, expect, it } from 'vitest';
import { createAppWorkflowActivityManager } from './app-workflow-activity.manager';
import { createTestDb } from '../database/test-db';
import { seedWorkflow } from '../database/test-fixtures';
import type { Db } from '../database/client';
import { AppWorkflowActivityType, type CreateAppWorkflowActivityInput, type ProfilesConfig } from '../../shared/app-workflow-activity';

let db: Db;

function profilesInput(overrides: Partial<CreateAppWorkflowActivityInput> = {}): CreateAppWorkflowActivityInput {
  const config: ProfilesConfig = { style: 'noir' };
  return { type: AppWorkflowActivityType.Profiles, name: 'Profiles', x: 0, y: 0, config, ...overrides };
}

beforeEach(() => {
  db = createTestDb();
});

describe('app workflow activity manager', () => {
  it('list() is empty for a freshly created workflow', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    expect(manager.list(workflow.id)).toEqual([]);
  });

  it('create() throws for a workflow that does not exist', () => {
    const manager = createAppWorkflowActivityManager(db);
    expect(() => manager.create('missing', profilesInput())).toThrow(/not found/);
  });

  it('create() persists the activity with default enabled', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);

    const activity = manager.create(workflow.id, profilesInput());

    expect(activity).toMatchObject({ workflowId: workflow.id, name: 'Profiles', enabled: true, dependencies: [] });
    expect(activity.profilesConfig).toEqual({ style: 'noir' });
    expect(manager.list(workflow.id)).toEqual([activity]);
  });

  it('create() rejects a dependency that is not an activity on this workflow', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    expect(() => manager.create(workflow.id, profilesInput({ dependencies: ['missing'] }))).toThrow(/Every dependency must be an activity/);
  });

  it('create() accepts a dependency on an already-existing activity, deduped', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    const first = manager.create(workflow.id, profilesInput());

    const second = manager.create(workflow.id, profilesInput({ name: 'Second', dependencies: [first.id, first.id] }));

    expect(second.dependencies).toEqual([first.id]);
  });

  it('update() merges partial fields, keeping the type fixed', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    const activity = manager.create(workflow.id, profilesInput());

    const updated = manager.update(workflow.id, activity.id, { name: 'Renamed' });

    expect(updated.name).toBe('Renamed');
    expect(updated.type).toBe(AppWorkflowActivityType.Profiles);
    expect(updated.profilesConfig).toEqual({ style: 'noir' });
  });

  it('update() throws for an activity that does not exist', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    expect(() => manager.update(workflow.id, 'missing', { name: 'x' })).toThrow(/not found/);
  });

  it('update() rejects an activity depending on itself', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    const activity = manager.create(workflow.id, profilesInput());

    expect(() => manager.update(workflow.id, activity.id, { dependencies: [activity.id] })).toThrow(/cannot depend on itself/);
  });

  it('update() rejects an unknown dependency', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    const activity = manager.create(workflow.id, profilesInput());

    expect(() => manager.update(workflow.id, activity.id, { dependencies: ['missing'] })).toThrow(/Every dependency must be an activity/);
  });

  it('remove() throws for an activity that does not exist', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    expect(() => manager.remove(workflow.id, 'missing')).toThrow(/not found/);
  });

  it('remove() deletes the activity and strips it from every dependent', () => {
    const workflow = seedWorkflow(db);
    const manager = createAppWorkflowActivityManager(db);
    const a = manager.create(workflow.id, profilesInput({ name: 'A' }));
    const b = manager.create(workflow.id, profilesInput({ name: 'B', dependencies: [a.id] }));

    manager.remove(workflow.id, a.id);

    expect(manager.list(workflow.id).map((activity) => activity.id)).toEqual([b.id]);
    expect(manager.list(workflow.id)[0].dependencies).toEqual([]);
  });
});
