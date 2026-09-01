import type { AppLibrary } from '@/shared/app-library';
import type { AppWorkspace, WorkspaceStepKey } from '@/shared/app-workspace';
import type { AppWorkspaceRun } from '@/shared/app-workspace-run';
import { formatDate } from '@/features/library/libraryFormat';
import { AVAILABILITY_LABEL, STATUS_LABEL, STEP_NAME, STEP_NOTE, orderLabelOf, presetMetaOf, recentActivitiesOf, stepUnitLabelOf, type WorkspaceStepView } from './workspaceFormat';

interface WorkspaceOverviewProps {
  workspace: AppWorkspace;
  /** The novel this workspace runs over, or undefined once it has been deleted from the library. */
  novel: AppLibrary | undefined;
  views: WorkspaceStepView[];
  /** This workspace's runs, newest first — the recent-activity card reads them. */
  runs: AppWorkspaceRun[];
  onOpenStep(key: WorkspaceStepKey): void;
  onOpenLog(): void;
}

function novelLabelOf(novel: AppLibrary | undefined): string {
  if (!novel) return 'Novel removed';
  const chapters = novel.novelMetadata?.downloadedCount;
  return chapters === undefined ? novel.title : `${novel.title} · ${chapters} ch.`;
}

/** The pipeline overview: one card per step, with the workspace's own facts beside them. */
export function WorkspaceOverview({ workspace, novel, views, runs, onOpenStep, onOpenLog }: WorkspaceOverviewProps) {
  const activities = recentActivitiesOf(runs);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', gap: '10.2px', alignItems: 'flex-start', paddingTop: 13.6 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 13.6 }}>
        {views.map((view) => (
          <div key={view.key} className="blueprint" style={{ padding: '13.6px 17px', display: 'flex', alignItems: 'center', gap: 20.4, opacity: view.step ? 1 : 0.55 }}>
            <div style={{ width: 190, flex: 'none' }}>
              <div className="step-kicker">Step {orderLabelOf(view.idx)} · {AVAILABILITY_LABEL[view.availability]}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{STEP_NAME[view.key]}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{stepUnitLabelOf(view.key)}</div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{view.step ? `${view.pct}%` : '—'}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{view.countLabel}</span>
              </div>
              <div className="progress-track" style={{ height: 5 }}>
                <div className="progress-fill" style={{ height: 5, width: `${view.pct}%` }} />
              </div>
              <div style={{ fontSize: 11, marginTop: 5, color: 'color-mix(in srgb, var(--color-text) 60%, transparent)' }}>{STEP_NOTE[view.key]}</div>
            </div>

            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2 }}>
              <span className={`tag ${view.tagClass}`}>{view.tag}</span>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => onOpenStep(view.key)}>Open</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ width: 380, flex: 'none', display: 'flex', flexDirection: 'column', gap: 13.6 }}>
        <div className="blueprint" style={{ padding: 17 }}>
          <div className="card-kicker">Workspace</div>
          <dl style={{ margin: '8px 0 0', fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '7px 13.6px' }}>
            <dt className="text-muted">Novel</dt>
            <dd style={{ margin: 0 }}>{novelLabelOf(novel)}</dd>
            <dt className="text-muted">Preset</dt>
            <dd style={{ margin: 0 }}>{presetMetaOf(workspace.preset).title}</dd>
            <dt className="text-muted">Status</dt>
            <dd style={{ margin: 0 }}>{STATUS_LABEL[workspace.status]}</dd>
            <dt className="text-muted">Last run</dt>
            <dd style={{ margin: 0 }}>{workspace.lastRunAt === null ? 'Never run' : formatDate(workspace.lastRunAt)}</dd>
            <dt className="text-muted">Created</dt>
            <dd style={{ margin: 0 }}>{formatDate(workspace.createdAt)}</dd>
            <dt className="text-muted">Updated</dt>
            <dd style={{ margin: 0 }}>{formatDate(workspace.updatedAt)}</dd>
            <dt className="text-muted">Description</dt>
            <dd style={{ margin: 0 }}>{workspace.description}</dd>
          </dl>
        </div>

        <div className="blueprint" style={{ padding: 17 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="card-kicker">Recent activity</div>
            <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 6px' }} onClick={onOpenLog}>Full log</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 10 }}>
            {activities.length === 0 ? (
              <span className="text-muted" style={{ fontSize: 12.5 }}>No executions yet.</span>
            ) : (
              activities.map((entry) => (
                <div key={entry.id} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
                  <span className="text-muted" style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{formatDate(entry.at)}</span>
                  <span className={`tag ${entry.tagClass}`} style={{ flex: 'none', fontSize: 10, padding: '1px 6px' }}>{entry.label}</span>
                  <span style={{ lineHeight: 1.4 }}>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
