import { useState } from 'react';
import type { WorldGlossaryTerm } from '@/shared/app-workspace-extraction';
import type { WorldTranslatedGlossaryTerm } from '@/shared/app-workspace-translation';
import { Bilingual } from '@/features/workspaces/translationFormat';
import { RowActions } from '@/features/workspaces/RowActions';
import { WorldEditDialog, type WorldEditField } from '@/features/workspaces/WorldEditDialog';

interface GlossaryTableProps {
  glossary: WorldTranslatedGlossaryTerm[];
  source: WorldGlossaryTerm[];
  onChange(glossary: WorldTranslatedGlossaryTerm[]): void;
}

function fieldsOf(term: WorldTranslatedGlossaryTerm, original: WorldGlossaryTerm | undefined): WorldEditField[] {
  return [
    { key: 'term', label: `Term · ${term.termOriginal}`, value: term.term },
    { key: 'category', label: 'Category', value: term.category, hint: original?.category },
    { key: 'definition', label: 'Definition', value: term.definition, rows: 4, hint: original?.definition },
  ];
}

/** The novel's proper nouns as rendered, each beside the original term. */
export function GlossaryTable({ glossary, source, onChange }: GlossaryTableProps) {
  const [editing, setEditing] = useState<number | undefined>(undefined);

  const originalOf = (term: WorldTranslatedGlossaryTerm): WorldGlossaryTerm | undefined => source.find((candidate) => candidate.term === term.termOriginal);

  const apply = (at: number, values: Record<string, string>) => {
    onChange(glossary.map((candidate, position) => (position === at ? { ...candidate, term: values.term, category: values.category, definition: values.definition } : candidate)));
    setEditing(undefined);
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '15%' }}>Category</th>
            <th style={{ width: '20%' }}>Term</th>
            <th style={{ width: '25%' }}>Rendered as</th>
            <th style={{ width: '35%' }}>Definition</th>
            <th style={{ width: '5%' }}>Chapters</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {glossary.map((term, at) => {
            const original = originalOf(term);
            return (
              <tr key={`${term.termOriginal}-${at}`}>
                <td>{term.category ? <span className="tag tag-neutral">{term.category}</span> : <span className="text-muted">—</span>}</td>
                <td className="text-muted" style={{ fontSize: 13 }}>{term.termOriginal}</td>
                <td style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{term.term}</td>
                <td><Bilingual original={original?.definition ?? ''} translated={term.definition} /></td>
                <td className="text-muted" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{term.chapterCount}</td>
                <td><RowActions onEdit={() => setEditing(at)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing !== undefined && (
        <WorldEditDialog title={`Edit ${glossary[editing].term}`} fields={fieldsOf(glossary[editing], originalOf(glossary[editing]))} onCancel={() => setEditing(undefined)} onSave={(values) => apply(editing, values)} />
      )}
    </>
  );
}
