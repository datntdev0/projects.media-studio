import type { AppWorkflow } from '../../../shared/app-workflow';
import { DetailHeader } from '../library/DetailHeader';
import { formatDate } from '../library/libraryFormat';
import { ACTIVITY_TYPE_META } from './workflowActivityFormat';
import { useAppWorkflowHistory } from './useAppWorkflowHistory';
import { RUN_STATUS_LABEL, RUN_STATUS_TAG_CLASS, formatDuration } from './workflowFormat';

interface WorkflowHistoryScreenProps {
  item: AppWorkflow;
  onBack(): void;
}

export function WorkflowHistoryScreen({ item, onBack }: WorkflowHistoryScreenProps) {
  const { runs, loading, error } = useAppWorkflowHistory(item.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6, height: '100%' }}>
      <DetailHeader backLabel={item.name} onBack={onBack} title="Run history" />

      {error && (
        <div className="text-muted" style={{ color: '#8a2f2f' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="blueprint" style={{ padding: 34, textAlign: 'center' }}>
          <div className="text-muted">No runs yet — executing this workflow will record a run here.</div>
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 13.6 }}>
          {runs.map((run) => (
            <div key={run.runId} className="blueprint" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, padding: '10.2px 13.6px', borderBottom: '1px solid var(--color-divider)' }}>
                <span className={`tag ${RUN_STATUS_TAG_CLASS[run.overview.status]}`}>{RUN_STATUS_LABEL[run.overview.status]}</span>
                <span style={{ fontSize: 13 }}>{formatDate(run.overview.startedAt)}</span>
                <span className="text-muted" style={{ fontSize: 12 }}>{formatDuration(run.overview.duration)}</span>
                <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
                  {run.activities.length} activit{run.activities.length === 1 ? 'y' : 'ies'}
                </span>
              </div>

              {run.overview.error && (
                <div style={{ padding: '8px 13.6px', fontSize: 12, color: '#8a2f2f', borderBottom: '1px solid var(--color-divider)' }}>{run.overview.error}</div>
              )}

              {run.activities.length > 0 && (
                <table className="table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '26%' }}>Activity</th>
                      <th style={{ width: '16%' }}>Status</th>
                      <th style={{ width: '20%' }}>Range</th>
                      <th style={{ width: '13%' }}>Started</th>
                      <th style={{ width: '13%' }}>Duration</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.activities.map((activity) => (
                      <tr key={activity.id}>
                        <td>
                          <div style={{ fontSize: 13 }}>{activity.activityName ?? '—'}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{activity.activityType ? ACTIVITY_TYPE_META[activity.activityType].label : '—'}</div>
                        </td>
                        <td>
                          <span className={`tag ${RUN_STATUS_TAG_CLASS[activity.status]}`} style={{ fontSize: 10 }}>{RUN_STATUS_LABEL[activity.status]}</span>
                        </td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{activity.range ?? '—'}</td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{formatDate(activity.startedAt)}</td>
                        <td className="text-muted" style={{ fontSize: 12 }}>{formatDuration(activity.duration)}</td>
                        <td className="text-muted" style={{ fontSize: 12, color: activity.error ? '#8a2f2f' : undefined }}>{activity.error ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
