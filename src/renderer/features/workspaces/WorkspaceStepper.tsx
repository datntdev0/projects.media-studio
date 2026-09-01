import type { AppWorkspace, WorkspaceStepKey } from '@/shared/app-workspace';
import { AVAILABILITY_LABEL, STEP_NAME, orderLabelOf, progressLabelOf, type WorkspaceStepView } from './workspaceFormat';

/** Which pane of the workspace detail is showing — the pipeline overview, the run log, or one step. */
export type WorkspaceTab = 'overview' | 'log' | WorkspaceStepKey;

interface WorkspaceStepperProps {
  workspace: AppWorkspace;
  views: WorkspaceStepView[];
  tab: WorkspaceTab;
  onSelect(tab: WorkspaceTab): void;
}

/** The detail header's stepper: the overview, then every step the preset defines. */
export function WorkspaceStepper({ workspace, views, tab, onSelect }: WorkspaceStepperProps) {
  return (
    <div className="step-tabs">
      <button type="button" className="step-tab is-overview" data-active={tab === 'overview'} onClick={() => onSelect('overview')}>
        <div className="step-kicker">Pipeline</div>
        <div className="step-tab-name">Overview</div>
        <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>{progressLabelOf(workspace)}</div>
      </button>

      {views.map((view) => (
        <button
          key={view.key}
          type="button"
          className="step-tab"
          data-active={tab === view.key}
          data-dim={view.step === undefined}
          title={view.countLabel}
          onClick={() => onSelect(view.key)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="step-kicker">Step {orderLabelOf(view.idx)} · {AVAILABILITY_LABEL[view.availability]}</div>
            <span className={`tag ${view.tagClass}`} style={{ marginLeft: 'auto', fontSize: 10, padding: '1px 6px' }}>{view.tag}</span>
          </div>
          <div className="step-tab-name">{STEP_NAME[view.key]}</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${view.pct}%` }} />
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{view.countLabel}</div>
        </button>
      ))}
    </div>
  );
}
