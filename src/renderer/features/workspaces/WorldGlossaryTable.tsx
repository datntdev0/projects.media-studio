import { useState } from 'react';
import { EditIcon, TrashIcon } from '@/components/icons';
import type { WorldGlossaryTerm } from '@/shared/app-workspace-extraction';
import { WorldEditDialog, type WorldEditField } from './WorldEditDialog';

interface WorldGlossaryTableProps {
  glossary: WorldGlossaryTerm[];
  onChange(glossary: WorldGlossaryTerm[]): void;
}

function fieldsOf(term: WorldGlossaryTerm): WorldEditField[] {
  return [
    { key: 'term', label: 'Term', value: term.term },
    { key: 'category', label: 'Category', value: term.category, hint: 'A place, item, technique, faction, rank or title.' },
    { key: 'definition', label: 'Definition', value: term.definition, rows: 4 },
    { key: 'chapterCount', label: 'Chapters', value: String(term.chapterCount), hint: 'How many chapters explain it — counted by the merge.' },
  ];
}

/** The novel's proper nouns as the merge collected them. */
export function WorldGlossaryTable({ glossary, onChange }: WorldGlossaryTableProps) {
  const [editing, setEditing] = useState<number | undefined>(undefined);

  const apply = (at: number, values: Record<string, string>) => {
    onChange(glossary.map((candidate, position) => (position === at ? { term: values.term, category: values.category, definition: values.definition, chapterCount: Number(values.chapterCount) || 0 } : candidate)));
    setEditing(undefined);
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '14%' }}>Category</th>
            <th style={{ width: '22%' }}>Term</th>
            <th style={{ width: '50%' }}>Definition</th>
            <th style={{ width: '8%' }}>Chapters</th>
            <th style={{ width: 60 }} />
          </tr>
        </thead>
        <tbody>
          {glossary.map((term, at) => (
            <tr key={`${term.term}-${at}`}>
              <td>{term.category ? <span className="tag tag-neutral">{term.category}</span> : <span className="text-muted">—</span>}</td>
              <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{term.term}</td>
              <td style={{ fontSize: 13 }}>{term.definition || '—'}</td>
              <td className="text-muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{term.chapterCount}</td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                  <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Edit" onClick={() => setEditing(at)}>
                    <EditIcon width={14} height={14} />
                  </button>
                  <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Remove" onClick={() => onChange(glossary.filter((_unused, position) => position !== at))}>
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing !== undefined && (
        <WorldEditDialog title={`Edit ${glossary[editing].term}`} fields={fieldsOf(glossary[editing])} onCancel={() => setEditing(undefined)} onSave={(values) => apply(editing, values)} />
      )}
    </>
  );
}
