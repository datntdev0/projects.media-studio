import type { Db } from '../database/client';
import { listAppWorkflowHistoryEntries } from '../database/repositories/app-workflow-history.repo';
import type { AppWorkflowHistoryEntry, AppWorkflowRun } from '../../shared/app-workflow-history';

export interface AppWorkflowHistoryManager {
  listRuns(workflowId: string): AppWorkflowRun[];
}

/** Groups a workflow's flat history entries back into one run per `runId` — the overview entry plus its activity entries, newest run first. */
function toRuns(entries: AppWorkflowHistoryEntry[]): AppWorkflowRun[] {
  const byRun = new Map<string, AppWorkflowHistoryEntry[]>();
  for (const entry of entries) {
    byRun.set(entry.runId, [...(byRun.get(entry.runId) ?? []), entry]);
  }

  const runs: AppWorkflowRun[] = [];
  for (const [runId, group] of byRun) {
    const overview = group.find((entry) => entry.activityId === null);
    if (!overview) continue;
    const activities = group.filter((entry) => entry.activityId !== null).sort((a, b) => a.startedAt - b.startedAt);
    runs.push({ runId, overview, activities });
  }

  return runs.sort((a, b) => b.overview.startedAt - a.overview.startedAt);
}

export function createAppWorkflowHistoryManager(db: Db): AppWorkflowHistoryManager {
  return {
    listRuns: (workflowId) => toRuns(listAppWorkflowHistoryEntries(db, workflowId)),
  };
}
