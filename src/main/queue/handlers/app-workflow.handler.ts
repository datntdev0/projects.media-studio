import { createLogger } from '../../helpers/logger';
import type { Db } from '../../database/client';
import type { Container } from '../../container';
import { QUEUE_NAMES } from '../queue-names';
import { getAppWorkflow, updateAppWorkflow } from '../../database/repositories/app-workflow.repo';
import { listAppWorkflowActivities } from '../../database/repositories/app-workflow-activity.repo';
import { stripStamps } from '../../managers/app-workflow.manager';
import { exportNovelLibrary } from '../../helpers/workflow-export';
import { executeActivity } from './app-workflow-activity-executor';
import { AppWorkflowStatus } from '../../../shared/app-workflow';
import { AppLibraryType } from '../../../shared/app-library';
import type { AppWorkflowActivity } from '../../../shared/app-workflow-activity';

const logger = createLogger('app-workflow');

interface WorkflowRunRequested {
  workflowId: string;
}

/** Runs a workflow where nobody is waiting for it — the record is the authority, so a run request against a workflow that is no longer `Running` (e.g. deleted, or already settled) is left alone. */
export function registerAppWorkflowHandler({ db, bus }: Container): void {
  bus.subscribe<WorkflowRunRequested>(QUEUE_NAMES.workflowRunRequested, (message) => {
    void runWorkflow(db, message.payload.workflowId).catch((error: unknown) => {
      logger.error(`Workflow ${message.payload.workflowId} failed to run`, error);
    });
  });
}

/** Orchestrates a workflow's activities over their dependency graph: each activity runs once every activity it depends on has settled, so independent branches run concurrently. Settles the workflow's status to `Active` or `Failed` once every activity is done. */
async function runWorkflow(db: Db, workflowId: string): Promise<void> {
  const workflow = getAppWorkflow(db, workflowId);
  if (!workflow || workflow.status !== AppWorkflowStatus.Running) {
    return;
  }

  const activities = listAppWorkflowActivities(db, workflowId);
  logger.info(`Workflow ${workflowId} started — ${activities.length} activity(ies)`);

  try {
    if (workflow.libraryType === AppLibraryType.Novel) {
      exportNovelLibrary(db, workflow);
    }

    assertAcyclic(activities);

    const byId = new Map(activities.map((activity) => [activity.id, activity]));
    const runs = new Map<string, Promise<void>>();

    const run = (id: string): Promise<void> => {
      const running = runs.get(id);
      if (running) {
        return running;
      }

      const activity = byId.get(id);
      const promise = activity ? Promise.all(activity.dependencies.map(run)).then(() => executeActivity(workflow, activity)) : Promise.resolve();
      runs.set(id, promise);
      return promise;
    };

    await Promise.all(activities.map((activity) => run(activity.id)));
    settleStatus(db, workflowId, AppWorkflowStatus.Active);
    logger.info(`Workflow ${workflowId} finished`);
  } catch (error) {
    settleStatus(db, workflowId, AppWorkflowStatus.Failed);
    throw error;
  }
}

function settleStatus(db: Db, workflowId: string, status: AppWorkflowStatus): void {
  const current = getAppWorkflow(db, workflowId);
  if (!current) {
    return;
  }
  updateAppWorkflow(db, workflowId, { ...stripStamps(current), status });
}

/** Kahn's algorithm: throws if the activity graph has a cycle, since the dependency-promise chain above would otherwise deadlock. */
function assertAcyclic(activities: AppWorkflowActivity[]): void {
  const indegree = new Map(activities.map((activity) => [activity.id, 0]));
  const dependents = new Map<string, string[]>();

  for (const activity of activities) {
    for (const depId of activity.dependencies) {
      if (!indegree.has(depId)) {
        continue;
      }
      indegree.set(activity.id, (indegree.get(activity.id) ?? 0) + 1);
      dependents.set(depId, [...(dependents.get(depId) ?? []), activity.id]);
    }
  }

  const queue = activities.filter((activity) => indegree.get(activity.id) === 0).map((activity) => activity.id);
  let visited = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const dependentId of dependents.get(id) ?? []) {
      const next = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, next);
      if (next === 0) {
        queue.push(dependentId);
      }
    }
  }

  if (visited !== activities.length) {
    throw new Error(`Workflow ${activities[0].workflowId} has a cyclic activity dependency graph`);
  }
}
