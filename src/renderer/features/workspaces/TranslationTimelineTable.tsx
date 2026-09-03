import { useState } from 'react';
import type { WorldTimeline } from '@/shared/app-workspace-extraction';
import type { WorldTranslationTimeline } from '@/shared/app-workspace-translation';
import { Bilingual } from './translationFormat';
import { formatList, parseList, timelineKeyLabel } from './worldFormat';
import { RowActions } from './RowActions';
import { WorldEditDialog, type WorldEditField } from './WorldEditDialog';

interface TranslationTimelineTableProps {
  timelines: WorldTranslationTimeline[];
  source: WorldTimeline[];
  onChange(timelines: WorldTranslationTimeline[]): void;
}

function fieldsOf(timeline: WorldTranslationTimeline, original: WorldTimeline | undefined): WorldEditField[] {
  return [
    { key: 'context', label: 'Context', value: timeline.context, hint: original?.context },
    { key: 'summary', label: 'Summary', value: timeline.summary, rows: 4, hint: original?.summary },
    { key: 'participants', label: 'Participants', value: formatList(timeline.participants), hint: `Character names as rendered, separated by commas. Original: ${formatList(original?.participants ?? []) || '—'}` },
  ];
}

/** The novel's scenes as translated, each beside the original summary it renders. */
export function TranslationTimelineTable({ timelines, source, onChange }: TranslationTimelineTableProps) {
  const [editing, setEditing] = useState<number | undefined>(undefined);

  const originalOf = (timeline: WorldTranslationTimeline): WorldTimeline | undefined => source.find((candidate) => candidate.idx === timeline.idx);

  const apply = (at: number, values: Record<string, string>) => {
    onChange(timelines.map((candidate, position) => (position === at ? { ...candidate, context: values.context, summary: values.summary, participants: parseList(values.participants) } : candidate)));
    setEditing(undefined);
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '14%' }}>Chapter · scene</th>
            <th style={{ width: '40%' }}>Summary</th>
            <th style={{ width: '26%' }}>Context</th>
            <th style={{ width: '20%' }}>Participants</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {timelines.map((timeline, at) => {
            const original = originalOf(timeline);
            return (
              <tr key={`${timeline.idx}-${at}`}>
                <td className="text-muted" style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{timelineKeyLabel(timeline.idx)}</td>
                <td><Bilingual original={original?.summary ?? ''} translated={timeline.summary} /></td>
                <td><Bilingual original={original?.context ?? ''} translated={timeline.context} /></td>
                <td><Bilingual original={formatList(original?.participants ?? [])} translated={formatList(timeline.participants)} /></td>
                <td><RowActions onEdit={() => setEditing(at)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing !== undefined && (
        <WorldEditDialog
          title={`Edit ${timelineKeyLabel(timelines[editing].idx)}`}
          fields={fieldsOf(timelines[editing], originalOf(timelines[editing]))}
          onCancel={() => setEditing(undefined)}
          onSave={(values) => apply(editing, values)}
        />
      )}
    </>
  );
}
