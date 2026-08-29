// Tracks which workflow ids are genuinely mid-execution in this process. `workflowRunRequested` is
// dispatched over the in-process message bus only — nothing durable replays it — so a workflow's DB
// status of `running` can't be trusted alone: if the app was closed or crashed mid-run, the next
// startup has no execution in flight for it at all, even though the row still says `running`. The
// manager consults this before treating a `running` workflow as genuinely busy vs. stale.
const runningWorkflowIds = new Set<string>();

export function markWorkflowRunStarted(workflowId: string): void {
  runningWorkflowIds.add(workflowId);
}

export function markWorkflowRunEnded(workflowId: string): void {
  runningWorkflowIds.delete(workflowId);
}

export function isWorkflowRunActive(workflowId: string): boolean {
  return runningWorkflowIds.has(workflowId);
}
