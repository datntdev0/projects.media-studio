import { useState } from 'react';
import type { WorldGlossaryTerm } from '@/shared/app-workspace-extraction';
import { RowActions } from '@/features/workspaces/RowActions';
import { WorldEditDialog, type WorldEditField } from '@/features/workspaces/WorldEditDialog';

interface GlossaryTableProps {
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
export function GlossaryTable({ glossary, onChange }: GlossaryTableProps) {
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
            <th style={{ width: '15%' }}>Category</th>
            <th style={{ width: '25%' }}>Term</th>
            <th style={{ width: '50%' }}>Definition</th>
            <th style={{ width: '10%' }}>Chapters</th>
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
              <td><RowActions onEdit={() => setEditing(at)} onRemove={() => onChange(glossary.filter((_unused, position) => position !== at))} /></td>
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
