import { createLogger } from '../../helpers/logger';
import { runWorkflowAnalyze } from '../../helpers/workflow-analyze';
import type { AppWorkflow } from '../../../shared/app-workflow';
import { AppWorkflowActivityType, type AppWorkflowActivity } from '../../../shared/app-workflow-activity';

const logger = createLogger('app-workflow');

// Stand-in for the actual work an activity type will do, so a run is visibly in progress rather than settling instantly.
const EXECUTION_DELAY_MS = 2_000;

export type ActivityExecutor = (workflow: AppWorkflow, activity: AppWorkflowActivity) => Promise<void>;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function logOnly(kind: string, workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  logger.info(`[${kind}] running activity (${activity.id}) of workflow '${workflow.id}' on library '${workflow.libraryId}'`);
  await wait(EXECUTION_DELAY_MS);
}

/** One executor per activity type — the strategy each activity is dispatched to once its dependencies have settled. Detailed per-type logic lands here later. */
const ACTIVITY_EXECUTORS: Record<AppWorkflowActivityType, ActivityExecutor> = {
  [AppWorkflowActivityType.Analyze]: (workflow, activity) => runWorkflowAnalyze(workflow, activity),
  [AppWorkflowActivityType.Translate]: (workflow, activity) => logOnly('translate', workflow, activity),
  [AppWorkflowActivityType.Profiles]: (workflow, activity) => logOnly('profiles', workflow, activity),
  [AppWorkflowActivityType.Storyboard]: (workflow, activity) => logOnly('storyboard', workflow, activity),
  [AppWorkflowActivityType.Tts]: (workflow, activity) => logOnly('tts', workflow, activity),
};

export function executeActivity(workflow: AppWorkflow, activity: AppWorkflowActivity): Promise<void> {
  return ACTIVITY_EXECUTORS[activity.type](workflow, activity);
}
