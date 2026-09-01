import type { AppWorkspace } from '@/shared/app-workspace';

interface WorkspaceRunLogProps {
  workspace: AppWorkspace;
}

/** The run log pane. Executions are not recorded anywhere yet, so it is always empty. */
export function WorkspaceRunLog({ workspace }: WorkspaceRunLogProps) {
  const note =
    workspace.lastRunAt === null
      ? 'This workspace has not been executed yet.'
      : 'Executions are not recorded yet — this log fills in once the runner is wired up.';

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20.4 }}>
      <div className="blueprint" style={{ maxWidth: 860, margin: '0 auto', borderStyle: 'dashed', padding: 34, textAlign: 'center' }}>
        <div className="card-kicker">Empty log</div>
        <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>{note}</div>
      </div>
    </div>
  );
}
