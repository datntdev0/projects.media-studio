import { EditIcon, SaveIcon, TrashIcon } from '../../components/icons';
import type { AppWorkflow } from '../../../shared/app-workflow';
import { DetailHeader } from '../library/DetailHeader';
import { STATUS_LABEL, STATUS_TAG_CLASS } from './workflowFormat';
import { useAppWorkflowActivities } from './useAppWorkflowActivities';
import { WorkflowCanvas } from './WorkflowCanvas';

interface WorkflowDetailScreenProps {
  item: AppWorkflow;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
}

export function WorkflowDetailScreen({ item, onBack, onEdit, onDelete }: WorkflowDetailScreenProps) {
  const { items: activities, loading, dirty, saving, saveError, add, patch, remove, moveMany, save } = useAppWorkflowActivities(item.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10.2 }}>
        <DetailHeader backLabel="Workflow" onBack={onBack} title={item.name} />
        <span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6.8 }}>
          {saveError && (
            <span className="text-muted" style={{ color: '#8a2f2f', fontSize: 12 }}>
              {saveError}
            </span>
          )}
          <button type="button" className="btn btn-secondary" style={{ gap: 6, fontSize: 13 }} onClick={onEdit}>
            <EditIcon width={14} height={14} />
            Edit info
          </button>
          <button type="button" className="btn btn-primary" style={{ gap: 6, fontSize: 13 }} onClick={save} disabled={!dirty || saving}>
            <SaveIcon width={14} height={14} />
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ gap: 6, fontSize: 13, color: '#8a2f2f' }} onClick={onDelete}>
            <TrashIcon width={14} height={14} />
            Delete
          </button>
        </div>
      </div>

      <WorkflowCanvas workflow={item} activities={activities} loading={loading} add={add} patch={patch} remove={remove} moveMany={moveMany} />
    </div>
  );
}
