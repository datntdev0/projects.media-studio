import { useState } from 'react';
import { DetailHeader } from '@/components/DetailHeader';
import { ClockIcon, PlayIcon } from '@/components/icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { AppLibrary } from '@/shared/app-library';
import { WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { isRunActive, type AppWorkspaceRun } from '@/shared/app-workspace-run';
import { STATUS_LABEL, STATUS_TAG_CLASS, activityStripOf, presetMetaOf, stepViewsOf } from './workspaceFormat';
import { useWorkspaceRuns } from './useWorkspaceRuns';
import { WorkspaceStepper, type WorkspaceTab } from './WorkspaceStepper';
import { WorkspaceOverview } from './WorkspaceOverview';
import { WorkspaceStepSoon } from './WorkspaceStepSoon';
import { WorkspaceSemanticAnalysis } from './WorkspaceSemanticAnalysis';
import { WorkspaceSemanticTranslate } from './WorkspaceSemanticTranslate';
import { WorkspaceNarrationSpeech } from './WorkspaceNarrationSpeech';
import { WorkspaceRunLog } from './WorkspaceRunLog';
import { WorkspaceExecuteDialog } from './WorkspaceExecuteDialog';

interface WorkspaceDetailScreenProps {
  workspace: AppWorkspace;
  novel: AppLibrary | undefined;
  onBack(): void;
  /** A run moves the workspace's own status and step counts — call this to reload it. */
  onRunChange(): void;
}

export function WorkspaceDetailScreen({ workspace, novel, onBack, onRunChange }: WorkspaceDetailScreenProps) {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [executeOpen, setExecuteOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<AppWorkspaceRun | undefined>(undefined);
  const [confirmClear, setConfirmClear] = useState(false);
  const { runs, loading, error, submit, cancel, clear } = useWorkspaceRuns(workspace.id, onRunChange);

  const views = stepViewsOf(workspace);
  const strip = activityStripOf(workspace);
  const activeView = views.find((view) => view.key === tab);
  const activeRun = runs.find(isRunActive);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 13.6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, flexWrap: 'wrap' }}>
        <DetailHeader backLabel="Workspaces" onBack={onBack} title={workspace.name} />
        <span className="tag tag-outline">{presetMetaOf(workspace.preset).title}</span>
        <span className={`tag ${STATUS_TAG_CLASS[workspace.status]}`}>{STATUS_LABEL[workspace.status]}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
          <button type="button" className="btn btn-secondary" style={{ gap: 6, fontSize: 13 }} onClick={() => setTab('log')}>
            <ClockIcon width={15} height={15} />
            Run log
            {runs.length > 0 && <span className="tag tag-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>{runs.length}</span>}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ gap: 6 }}
            onClick={() => setExecuteOpen(true)}
            disabled={activeRun !== undefined}
            title={activeRun ? 'A run is already in flight — cancel it from the run log first.' : undefined}
          >
            <PlayIcon width={15} height={15} />
            Execute…
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <WorkspaceStepper workspace={workspace} views={views} tab={tab} onSelect={setTab} />

        <div className="activity-strip">
          <span className="activity-dot" data-pulsing={strip.pulsing} style={{ background: strip.dotColor }} />
          <span>
            <b style={{ fontFamily: 'var(--font-heading)' }}>{strip.title}</b> — {strip.detail}
          </span>
          {tab !== 'log' && runs.length > 0 && (
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }} onClick={() => setTab('log')}>View log</button>
          )}
        </div>

        {tab === 'log' ? (
          <WorkspaceRunLog runs={runs} loading={loading} error={error} onCancel={setConfirmCancel} onClear={() => setConfirmClear(true)} />
        ) : tab === WorkspaceStepKey.SemanticAnalysis ? (
          <WorkspaceSemanticAnalysis workspace={workspace} />
        ) : tab === WorkspaceStepKey.SemanticTranslate && activeView?.step ? (
          <WorkspaceSemanticTranslate workspace={workspace} />
        ) : tab === WorkspaceStepKey.NarrationSpeech ? (
          <WorkspaceNarrationSpeech workspace={workspace} />
        ) : activeView ? (
          <WorkspaceStepSoon view={activeView} />
        ) : (
          <WorkspaceOverview workspace={workspace} novel={novel} views={views} runs={runs} onOpenStep={setTab} onOpenLog={() => setTab('log')} />
        )}
      </div>

      {executeOpen && (
        <WorkspaceExecuteDialog workspace={workspace} novel={novel} onClose={() => setExecuteOpen(false)} onSubmit={submit} />
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="Cancel execution"
          message={`Cancel execution #${confirmCancel.seq}? Steps that have not finished are marked skipped.`}
          onCancel={() => setConfirmCancel(undefined)}
          onConfirm={() => {
            cancel(confirmCancel.id);
            setConfirmCancel(undefined);
          }}
        />
      )}
      {confirmClear && (
        <ConfirmDialog
          title="Clear run log"
          message={`Delete all ${runs.length} execution(s) of this workspace? The pipeline's progress is measured from them, so it resets to nothing done.`}
          confirmLabel="Clear"
          onCancel={() => setConfirmClear(false)}
          onConfirm={() => {
            clear();
            setConfirmClear(false);
          }}
        />
      )}
    </div>
  );
}
