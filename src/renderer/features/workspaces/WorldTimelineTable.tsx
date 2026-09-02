import { useState } from 'react';
import { EditIcon, TrashIcon } from '@/components/icons';
import type { WorldTimeline } from '@/shared/app-workspace-extraction';
import { formatList, parseList, timelineKeyLabel } from './worldFormat';
import { WorldEditDialog, type WorldEditField } from './WorldEditDialog';

interface WorldTimelineTableProps {
  timelines: WorldTimeline[];
  onChange(timelines: WorldTimeline[]): void;
}

function fieldsOf(timeline: WorldTimeline): WorldEditField[] {
  return [
    { key: 'idx', label: 'Scene id', value: timeline.idx, hint: '`chapterXXXX-timelineYYYY` — what a character\'s per-scene details point at.' },
    { key: 'context', label: 'Context', value: timeline.context, hint: 'Where and when it happens.' },
    { key: 'summary', label: 'Summary', value: timeline.summary, rows: 4 },
    { key: 'participants', label: 'Participants', value: formatList(timeline.participants), hint: 'Character names, separated by commas.' },
  ];
}

/** The novel's scenes in story order — one row each, edited in place through the dialog. */
export function WorldTimelineTable({ timelines, onChange }: WorldTimelineTableProps) {
  const [editing, setEditing] = useState<number | undefined>(undefined);

  const apply = (at: number, values: Record<string, string>) => {
    onChange(timelines.map((candidate, position) => (position === at ? { idx: values.idx, context: values.context, summary: values.summary, participants: parseList(values.participants) } : candidate)));
    setEditing(undefined);
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '16%' }}>Chapter · scene</th>
            <th style={{ width: '28%' }}>Summary</th>
            <th style={{ width: '30%' }}>Context</th>
            <th style={{ width: '20%' }}>Participants</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {timelines.map((timeline, at) => (
            <tr key={`${timeline.idx}-${at}`}>
              <td className="text-muted" style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{timelineKeyLabel(timeline.idx)}</td>
              <td style={{ fontSize: 13 }}>{timeline.summary || '—'}</td>
              <td className="text-muted" style={{ fontSize: 13 }}>{timeline.context || '—'}</td>
              <td style={{ fontSize: 13 }}>{timeline.participants.join(', ') || '—'}</td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Edit" onClick={() => setEditing(at)}>
                    <EditIcon width={14} height={14} />
                  </button>
                  <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Remove" onClick={() => onChange(timelines.filter((_unused, position) => position !== at))}>
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing !== undefined && (
        <WorldEditDialog
          title={`Edit ${timelineKeyLabel(timelines[editing].idx)}`}
          fields={fieldsOf(timelines[editing])}
          onCancel={() => setEditing(undefined)}
          onSave={(values) => apply(editing, values)}
        />
      )}
    </>
  );
}
