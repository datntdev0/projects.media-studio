import { useState } from 'react';
import { CalendarIcon, CloseIcon, PlayIcon } from '@/components/icons';
import type { AppLibrary } from '@/shared/app-library';
import { WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { STEP_NAME, orderLabelOf } from './workspaceFormat';
import { ExecutionMode, RETRY_DELAY_OPTIONS, RETRY_OPTIONS, StepStartMode, defaultScheduleStart, retryLabelOf, type ExecutionStepPlan, type WorkspaceExecutionRequest } from './workspaceExecution';

interface WorkspaceExecuteDialogProps {
  workspace: AppWorkspace;
  /** The novel the range is counted against — its chapter count bounds the range. */
  novel: AppLibrary | undefined;
  onClose(): void;
  onSubmit(request: WorkspaceExecutionRequest): void;
}

const MODE_CARDS = [
  { mode: ExecutionMode.Immediate, Icon: PlayIcon, title: 'Immediately', hint: 'Starts now. Each step begins as soon as the previous one completes.' },
  { mode: ExecutionMode.Scheduled, Icon: CalendarIcon, title: 'Scheduled', hint: 'Pick a start time for the workspace, and optionally per step.' },
];

function immediateNoteOf(workspace: AppWorkspace): string {
  if (workspace.lastRunAt === null) return 'The full pipeline runs over the chapter range, one step at a time.';
  if (workspace.status === WorkspaceStatus.Completed) return 'Everything in range may already be done — a new run re-checks the range and skips finished sub-steps.';
  return 'The run resumes from current progress within the chapter range — completed sub-steps are skipped, and steps still run one at a time.';
}

function initialPlans(workspace: AppWorkspace): ExecutionStepPlan[] {
  return workspace.steps.map((step) => ({
    key: step.key,
    enabled: true,
    startMode: StepStartMode.AfterPrevious,
    startAt: '',
    retries: 3,
    retryDelayMinutes: 5,
  }));
}

/** Why the request cannot be submitted yet, or undefined when it can. */
function validate(mode: ExecutionMode, from: number, to: number, total: number, plans: ExecutionStepPlan[]): string | undefined {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return 'The chapter range needs a start and an end, with the end at or after the start.';
  if (total > 0 && to > total) return `The novel has ${total} chapters — the range cannot end past it.`;
  const enabled = plans.filter((plan) => plan.enabled);
  if (enabled.length === 0) return 'Pick at least one step to run.';
  if (mode === ExecutionMode.Immediate) return undefined;
  if (enabled.some((plan) => plan.startMode === StepStartMode.AtTime && plan.startAt === '')) return 'A step set to start at a time needs that time.';
  return undefined;
}

export function WorkspaceExecuteDialog({ workspace, novel, onClose, onSubmit }: WorkspaceExecuteDialogProps) {
  const total = novel?.novelMetadata?.discoveredCount ?? 0;
  const [mode, setMode] = useState<ExecutionMode>(ExecutionMode.Immediate);
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(total === 0 ? 1 : total));
  const [startAt, setStartAt] = useState(defaultScheduleStart());
  const [plans, setPlans] = useState<ExecutionStepPlan[]>(() => initialPlans(workspace));

  const scheduled = mode === ExecutionMode.Scheduled;
  const fromNo = Number(from);
  const toNo = Number(to);
  const error = validate(mode, fromNo, toNo, total, plans);
  const inRange = error === undefined ? toNo - fromNo + 1 : 0;

  const patchPlan = (key: WorkspaceStepKey, patch: Partial<ExecutionStepPlan>) =>
    setPlans((current) => current.map((plan) => (plan.key === key ? { ...plan, ...patch } : plan)));

  const handleSubmit = () => {
    if (error) return;
    onSubmit({ mode, fromChapter: fromNo, toChapter: toNo, startAt: scheduled ? startAt : '', steps: plans });
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(680px, 100%)', background: 'var(--color-bg)', padding: 0, gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13.6, padding: '16px 20.4px', borderBottom: '1px solid var(--color-divider)' }}>
          <div style={{ minWidth: 0 }}>
            <div className="card-kicker" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{workspace.name}</div>
            <div className="dialog-title">Execute workspace</div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} style={{ marginLeft: 'auto', borderColor: 'transparent' }} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: 20.4, maxHeight: '64vh', overflow: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13.6, marginBottom: 20.4 }}>
            {MODE_CARDS.map(({ mode: cardMode, Icon, title, hint }) => (
              <label
                key={cardMode}
                className="blueprint"
                style={{ padding: 13.6, display: 'block', cursor: 'pointer', background: mode === cardMode ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent' }}
              >
                <input type="radio" name="execmode" style={{ position: 'absolute', opacity: 0 }} checked={mode === cardMode} onChange={() => setMode(cardMode)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon />
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{title}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{hint}</div>
              </label>
            ))}
          </div>

          <div className="field" style={{ marginBottom: 20.4 }}>
            <label>Chapter range</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input" style={{ width: 90 }} value={from} onChange={(e) => setFrom(e.target.value)} inputMode="numeric" />
              <span className="text-muted" style={{ fontSize: 13 }}>to</span>
              <input className="input" style={{ width: 90 }} value={to} onChange={(e) => setTo(e.target.value)} inputMode="numeric" />
              <span className="text-muted" style={{ fontSize: 12 }}>
                {inRange > 0 ? `${inRange} chapters in range · sub-steps outside the range are skipped` : `${total} chapters in the novel`}
              </span>
            </div>
          </div>

          {scheduled ? (
            <>
              <div className="field" style={{ marginBottom: 17, maxWidth: 280 }}>
                <label>Workspace start</label>
                <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 6 }}><label>Steps in this run</label></div>
              <table className="table" style={{ marginBottom: 13.6 }}>
                <thead>
                  <tr>
                    <th style={{ width: '35%' }}>Step</th>
                    <th style={{ width: '35%' }}>Start</th>
                    <th style={{ width: '15%' }}>Retry #</th>
                    <th style={{ width: '15%' }}>Retry delay</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => {
                    const step = workspace.steps.find((candidate) => candidate.key === plan.key);
                    return (
                      <tr key={plan.key}>
                        <td>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                              checked={plan.enabled}
                              onChange={() => patchPlan(plan.key, { enabled: !plan.enabled })}
                            />
                            {orderLabelOf(step?.idx ?? 0)} · {STEP_NAME[plan.key]}
                          </label>
                        </td>
                        <td>
                          <select
                            className="input"
                            style={{ fontSize: 12.5, width: '100%' }}
                            value={plan.startMode}
                            disabled={!plan.enabled}
                            onChange={(e) => patchPlan(plan.key, { startMode: e.target.value as StepStartMode })}
                          >
                            <option value={StepStartMode.AfterPrevious}>Immediately after previous</option>
                            <option value={StepStartMode.AtTime}>At a set time…</option>
                          </select>
                          {plan.startMode === StepStartMode.AtTime && (
                            <input
                              className="input"
                              type="datetime-local"
                              style={{ fontSize: 12.5, marginTop: 5 }}
                              value={plan.startAt}
                              disabled={!plan.enabled}
                              onChange={(e) => patchPlan(plan.key, { startAt: e.target.value })}
                            />
                          )}
                        </td>
                        <td>
                          <select
                            className="input"
                            style={{ fontSize: 12.5, width: '100%' }}
                            value={plan.retries}
                            disabled={!plan.enabled}
                            onChange={(e) => patchPlan(plan.key, { retries: Number(e.target.value) })}
                          >
                            {RETRY_OPTIONS.map((retries) => (
                              <option key={retries} value={retries}>{retryLabelOf(retries)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="input"
                            style={{ fontSize: 12.5, width: '100%' }}
                            value={plan.retryDelayMinutes}
                            disabled={!plan.enabled || plan.retries === 0}
                            onChange={(e) => patchPlan(plan.key, { retryDelayMinutes: Number(e.target.value) })}
                          >
                            {RETRY_DELAY_OPTIONS.map((minutes) => (
                              <option key={minutes} value={minutes}>{minutes} min</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                A step with no set time starts as soon as the previous step completes. A step with a set time waits for both the time and the previous step. Retries apply per sub-step — a chapter or a part.
              </div>
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{immediateNoteOf(workspace)}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8, padding: '13.6px 20.4px', borderTop: '1px solid var(--color-divider)' }}>
          <span className="text-muted" style={{ fontSize: 12, color: error ? '#8a2f2f' : undefined }}>
            {error ?? (scheduled ? 'The schedule can be edited or cancelled until the run starts.' : 'Steps run in order; a step starts when the previous one completes.')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={error !== undefined}>
              {scheduled ? 'Schedule execution' : 'Start now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
