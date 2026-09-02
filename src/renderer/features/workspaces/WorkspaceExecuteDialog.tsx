import { useState } from 'react';
import { CloseIcon } from '@/components/icons';
import type { AppLibrary } from '@/shared/app-library';
import { WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { WorkspaceRunMode, validateRunInput, type SubmitWorkspaceRunInput } from '@/shared/app-workspace-run';
import { STEP_NAME, orderLabelOf } from './workspaceFormat';
import { DEFAULT_RETRY_DELAY_MINUTES, RETRY_DELAY_OPTIONS, RETRY_OPTIONS, StepStartMode, defaultStepStart, missingStartTimeOf, retryDelayLabelOf, retryLabelOf, runModeOf, toRunInput, type ExecutionStepPlan } from './workspaceExecution';

interface WorkspaceExecuteDialogProps {
  workspace: AppWorkspace;
  /** The novel the range is counted against — its chapter count bounds the range. */
  novel: AppLibrary | undefined;
  onClose(): void;
  onSubmit(input: SubmitWorkspaceRunInput): Promise<unknown>;
}

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
    retryDelayMinutes: DEFAULT_RETRY_DELAY_MINUTES,
  }));
}

/** A booked run needs an anchor, so the first step it covers starts on the clock too. */
function anchorFirstStep(plans: ExecutionStepPlan[]): ExecutionStepPlan[] {
  const first = plans.find((plan) => plan.enabled);
  if (!first || first.startMode === StepStartMode.AtTime) return plans;
  return plans.map((plan) => (plan === first ? { ...plan, startMode: StepStartMode.AtTime, startAt: plan.startAt || defaultStepStart(undefined) } : plan));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WorkspaceExecuteDialog({ workspace, novel, onClose, onSubmit }: WorkspaceExecuteDialogProps) {
  const total = novel?.novelMetadata?.discoveredCount ?? 0;
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(total === 0 ? 1 : total));
  const [plans, setPlans] = useState<ExecutionStepPlan[]>(() => initialPlans(workspace));
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  const scheduled = runModeOf(plans) === WorkspaceRunMode.Scheduled;
  const input = toRunInput(workspace.id, from, to, plans);
  const error = missingStartTimeOf(plans) ?? validateRunInput(input, total, Date.now());
  const inRange = error === undefined ? input.toChapter - input.fromChapter + 1 : 0;

  const patchPlan = (key: WorkspaceStepKey, patch: Partial<ExecutionStepPlan>) =>
    setPlans((current) => current.map((plan) => (plan.key === key ? { ...plan, ...patch } : plan)));

  /** The time a step's picker opens on — staggered after the last step booked ahead of it. */
  const startAtDefaultFor = (plan: ExecutionStepPlan): string => {
    const booked = plans.slice(0, plans.indexOf(plan)).filter((candidate) => candidate.enabled && candidate.startAt !== '');
    return defaultStepStart(booked.at(-1)?.startAt);
  };

  /** Sets how one step starts, booking the run's first step with it so the run has its anchor. */
  const bookStep = (plan: ExecutionStepPlan, startMode: StepStartMode) => {
    const atTime = startMode === StepStartMode.AtTime;
    patchPlan(plan.key, { startMode, startAt: atTime ? plan.startAt || startAtDefaultFor(plan) : plan.startAt });
    if (atTime) setPlans(anchorFirstStep);
  };

  const handleSubmit = async () => {
    if (error) return;
    setSubmitting(true);
    setFailure(undefined);
    try {
      await onSubmit(input);
      onClose();
    } catch (err) {
      setFailure(errorMessage(err));
      setSubmitting(false);
    }
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
                        onChange={(e) => bookStep(plan, e.target.value as StepStartMode)}
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
                          <option key={minutes} value={minutes}>{retryDelayLabelOf(minutes)}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
            {scheduled
              ? 'The first step in the run needs a set time — it is what the run waits on. A later step with no set time starts as soon as the step ahead of it completes; one with a set time waits for both.'
              : `${immediateNoteOf(workspace)} Set a start time on a step to book the run for later instead.`}
            {' '}Retries apply per sub-step — a chapter or a part — and the delay doubles with each one.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8, padding: '13.6px 20.4px', borderTop: '1px solid var(--color-divider)' }}>
          <span className="text-muted" style={{ fontSize: 12, color: error || failure ? '#8a2f2f' : undefined }}>
            {failure ?? error ?? (scheduled ? 'A booked run can be cancelled from the run log until it starts.' : 'Steps run in order; a step starts when the previous one completes.')}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={error !== undefined || submitting}>
              {scheduled ? 'Schedule execution' : 'Start now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
