import { HistoryIcon, PlayIcon, SaveIcon } from '../../components/icons';
import { AppWorkflowStatus, type AppWorkflow } from '../../../shared/app-workflow';
import { DetailHeader } from '../library/DetailHeader';
import { STATUS_LABEL, STATUS_TAG_CLASS } from './workflowFormat';
import { useAppWorkflowActivities } from './useAppWorkflowActivities';
import { WorkflowCanvas } from './WorkflowCanvas';

interface WorkflowDetailScreenProps {
  item: AppWorkflow;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  onRun(): void;
  onHistory(): void;
  running: boolean;
  runError: string | undefined;
}

export function WorkflowDetailScreen({ item, onBack, onEdit, onDelete, onRun, onHistory, running, runError }: WorkflowDetailScreenProps) {
  const { items: activities, loading, dirty, saving, saveError, add, patch, remove, moveMany, save } = useAppWorkflowActivities(item.id);
  // The workflow row can be left showing `running` by a prior run the app was closed or crashed
  // during — nothing in this process is actually executing it. Offer to reset it rather than
  // leaving the button stuck; the backend settles the stale run before starting a fresh one.
  const stuck = item.status === AppWorkflowStatus.Running && !running;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2 }}>
        <DetailHeader backLabel="Workflow" onBack={onBack} title={item.name} />
        <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6.8 }}>
          {(saveError || runError) && (
            <span className="text-muted" style={{ color: '#8a2f2f', fontSize: 12 }}>
              {saveError || runError}
            </span>
          )}
          <button type="button" className="btn btn-primary" style={{ gap: 6, fontSize: 13 }} onClick={save} disabled={!dirty || saving}>
            <SaveIcon width={14} height={14} />
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ gap: 6, fontSize: 13 }}
            onClick={onRun}
            disabled={running || activities.length === 0}
            title={stuck ? 'Showing Running but nothing is executing it — likely left over from an interrupted run. Click to reset its status and run again.' : undefined}
          >
            <PlayIcon width={14} height={14} />
            {running ? 'Running…' : stuck ? 'Reset & run' : 'Execute'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ gap: 6, fontSize: 13 }} onClick={onHistory}>
            <HistoryIcon width={14} height={14} />
            History
          </button>
        </div>
      </div>

      <WorkflowCanvas workflow={item} activities={activities} loading={loading} add={add} patch={patch} remove={remove} moveMany={moveMany} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
