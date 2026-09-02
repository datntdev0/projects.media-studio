import { WorkspaceStepState } from '@/shared/app-workspace';
import { isRunActive, type AppWorkspaceRun, type WorkspaceRunStep } from '@/shared/app-workspace-run';
import { formatDate } from '@/features/library/libraryFormat';
import { RUN_MODE_LABEL, RUN_STATUS_LABEL, RUN_STATUS_TAG_CLASS, STEP_NAME, STEP_STATE_LABEL, STEP_STATE_TAG_CLASS, orderLabelOf, runRangeLabelOf, stepCountLabelOf } from './workspaceFormat';
import { retryDelayLabelOf } from './workspaceExecution';

interface WorkspaceRunLogProps {
  runs: AppWorkspaceRun[];
  loading: boolean;
  error: string | undefined;
  onCancel(run: AppWorkspaceRun): void;
  onClear(): void;
}

/** When a step ran, or what it is still waiting for. */
function timingOf(step: WorkspaceRunStep): string {
  if (step.startedAt === null) return step.startAt === null ? 'waits for the step ahead of it' : `booked ${formatDate(step.startAt)}`;
  if (step.endedAt === null) return `started ${formatDate(step.startedAt)}`;
  return `${formatDate(step.startedAt)} → ${formatDate(step.endedAt)}`;
}

export function WorkspaceRunLog({ runs, loading, error, onCancel, onClear }: WorkspaceRunLogProps) {
  if (loading) {
    return <div className="text-muted" style={{ padding: 20.4 }}>Loading…</div>;
  }

  const inFlight = runs.some(isRunActive);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20.4 }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 17 }}>
        {error && <div style={{ color: '#8a2f2f', fontSize: 13 }}>{error}</div>}

        {runs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10.2 }}>
            <span className="card-kicker">{runs.length} execution{runs.length === 1 ? '' : 's'}</span>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }}
              onClick={onClear}
              disabled={inFlight}
              title={inFlight ? 'A run is in flight — cancel it before clearing the log.' : undefined}
            >
              Clear
            </button>
          </div>
        )}

        {runs.length === 0 ? (
          <div className="blueprint" style={{ borderStyle: 'dashed', padding: 34, textAlign: 'center' }}>
            <div className="card-kicker">Empty log</div>
            <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>This workspace has not been executed yet.</div>
          </div>
        ) : (
          runs.map((run) => (
            <div key={run.id} className="blueprint" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, padding: '12px 17px', borderBottom: '1px solid var(--color-divider)', background: 'color-mix(in srgb, var(--color-text) 2.5%, transparent)' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>Execution #{run.seq}</span>
                <span className="tag tag-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>{RUN_MODE_LABEL[run.mode]}</span>
                <span className={`tag ${RUN_STATUS_TAG_CLASS[run.status]}`}>{RUN_STATUS_LABEL[run.status]}</span>
                <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{runRangeLabelOf(run)}</span>
                {isRunActive(run) && (
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onCancel(run)}>Cancel</button>
                )}
              </div>

              <div style={{ padding: '13.6px 17px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {run.steps.map((step) => (
                  <div key={step.stepKey} style={{ display: 'flex', gap: 10, fontSize: 12.5, alignItems: 'baseline' }}>
                    <span className="text-muted" style={{ flex: 'none', width: 24, fontVariantNumeric: 'tabular-nums' }}>{orderLabelOf(step.idx)}</span>
                    <span className={`tag ${STEP_STATE_TAG_CLASS[step.state]}`} style={{ flex: 'none', fontSize: 10, padding: '1px 6px' }}>{STEP_STATE_LABEL[step.state]}</span>
                    <span style={{ flex: 'none', minWidth: 150 }}>{STEP_NAME[step.stepKey]}</span>
                    <span className="text-muted" style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
                      {timingOf(step)}
                      {step.state !== WorkspaceStepState.Pending && ` · ${stepCountLabelOf(step)} sub-steps`}
                      {step.error && ` · ${step.error}`}
                    </span>
                    <span className="text-muted" style={{ flex: 'none', fontSize: 11 }}>
                      retry {step.retries === 0 ? 'off' : `${step.retries}× / ${retryDelayLabelOf(step.retryDelayMinutes)}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
