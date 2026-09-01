import { useMemo, useState } from 'react';
import { PlusIcon, TrashIcon } from '../../components/icons';
import { formatDate } from './libraryFormat';
import { CHAPTER_STATUS_LABEL, CHAPTER_STATUS_TAG_CLASS, countWords, type ChapterRow } from './chapter';

interface ChapterTableProps {
  chapters: ChapterRow[];
  onOpen(id: string): void;
  onDelete(chapter: ChapterRow): void;
  onDeleteMany(chapters: ChapterRow[]): void;
  onAddChapter(): void;
}

export function ChapterTable({ chapters, onOpen, onDelete, onDeleteMany, onAddChapter }: ChapterTableProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chapters;
    return chapters.filter((c) => c.title.toLowerCase().includes(needle));
  }, [chapters, query]);

  const selectedCount = selected.size;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    onDeleteMany(chapters.filter((c) => selected.has(c.id)));
    setSelected(new Set());
  };

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, borderBottom: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
        <h5 style={{ margin: 0 }}>Chapters</h5>
        <span className="tag tag-neutral">{chapters.length}</span>
        <div style={{ width: 180 }}>
          <input className="input" placeholder="Find chapter..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6.8 }}>
          {selectedCount > 0 && (
            <>
              <span className="text-muted" style={{ fontSize: 12 }}>{selectedCount} selected</span>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 13, color: '#8a2f2f' }} onClick={handleDeleteSelected}>Delete selected</button>
            </>
          )}
          <button type="button" className="btn btn-secondary" onClick={onAddChapter} style={{ gap: 6, fontSize: 13 }}>
            <PlusIcon width={14} height={14} />
            Add chapter
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {chapters.length === 0 ? (
          <div className="blueprint" style={{ margin: 20.4, padding: 34, textAlign: 'center' }}>
            <div className="text-muted">No chapters recorded yet — importing a package or adding one manually gets it started.</div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 38 }}></th>
                <th style={{ width: 64 }}>No.</th>
                <th>Title</th>
                <th style={{ width: 96 }}>Words</th>
                <th style={{ width: 112 }}>Status</th>
                <th style={{ width: 112 }}>Updated</th>
                <th style={{ width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((chapter) => (
                <tr key={chapter.id} style={{ cursor: 'pointer' }} onClick={() => onOpen(chapter.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(chapter.id)}
                      onChange={() => toggleOne(chapter.id)}
                      style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                    />
                  </td>
                  <td className="text-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{chapter.no}</td>
                  <td style={{ fontSize: 14 }}>{chapter.title}</td>
                  <td className="text-muted" style={{ fontSize: 13 }}>{countWords(chapter.sourceBody) || '—'}</td>
                  <td>
                    <span className={`tag ${CHAPTER_STATUS_TAG_CLASS[chapter.status]}`}>{CHAPTER_STATUS_LABEL[chapter.status]}</span>
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{formatDate(chapter.updatedAt)}</td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} onClick={() => onDelete(chapter)} aria-label="Delete chapter">
                      <TrashIcon width={14} height={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
