import { useState } from 'react';
import { DetailHeader } from '@/components/DetailHeader';
import { ClockIcon, CloseIcon, PlayIcon } from '@/components/icons';
import type { AppLibrary } from '@/shared/app-library';
import type { AppWorkspace } from '@/shared/app-workspace';
import { STATUS_LABEL, STATUS_TAG_CLASS, activityOf, presetMetaOf, stepViewsOf } from './workspaceFormat';
import { describeRequest } from './workspaceExecution';
import { WorkspaceStepper, type WorkspaceTab } from './WorkspaceStepper';
import { WorkspaceOverview } from './WorkspaceOverview';
import { WorkspaceStepSoon } from './WorkspaceStepSoon';
import { WorkspaceRunLog } from './WorkspaceRunLog';
import { WorkspaceExecuteDialog } from './WorkspaceExecuteDialog';

interface WorkspaceDetailScreenProps {
  workspace: AppWorkspace;
  novel: AppLibrary | undefined;
  onBack(): void;
}

export function WorkspaceDetailScreen({ workspace, novel, onBack }: WorkspaceDetailScreenProps) {
  const [tab, setTab] = useState<WorkspaceTab>('overview');
  const [executeOpen, setExecuteOpen] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const views = stepViewsOf(workspace);
  const activity = activityOf(workspace);
  const activeView = views.find((view) => view.key === tab);

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
          </button>
          <button type="button" className="btn btn-primary" style={{ gap: 6 }} onClick={() => setExecuteOpen(true)}>
            <PlayIcon width={15} height={15} />
            Execute…
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <WorkspaceStepper workspace={workspace} views={views} tab={tab} onSelect={setTab} />

        <div className="activity-strip">
          <span className="activity-dot" data-pulsing={activity.pulsing} style={{ background: activity.dotColor }} />
          <span>
            <b style={{ fontFamily: 'var(--font-heading)' }}>{activity.title}</b> — {activity.detail}
          </span>
        </div>

        {notice && (
          <div className="activity-strip" style={{ background: 'color-mix(in srgb, var(--color-text) 4%, transparent)' }}>
            <span>{notice}</span>
            <button type="button" className="btn btn-secondary btn-icon" onClick={() => setNotice(undefined)} style={{ marginLeft: 'auto', borderColor: 'transparent', width: 24, height: 24 }} aria-label="Dismiss">
              <CloseIcon width={14} height={14} />
            </button>
          </div>
        )}

        {tab === 'log' ? (
          <WorkspaceRunLog workspace={workspace} />
        ) : activeView ? (
          <WorkspaceStepSoon view={activeView} />
        ) : (
          <WorkspaceOverview workspace={workspace} novel={novel} views={views} onOpenStep={setTab} />
        )}
      </div>

      {executeOpen && (
        <WorkspaceExecuteDialog
          workspace={workspace}
          novel={novel}
          onClose={() => setExecuteOpen(false)}
          onSubmit={(request) => {
            // Nothing runs it yet — the request is only echoed back so the form can be exercised.
            setNotice(`Execution requested — ${describeRequest(request)}. Nothing started: the runner is not wired up yet.`);
            setExecuteOpen(false);
          }}
        />
      )}
    </div>
  );
}
