import { useEffect, useState } from 'react';
import { useResizablePanel } from '@/components/useResizablePanel';
import { countWords, type ChapterRow } from './chapter';

interface ChapterReaderProps {
  chapters: ChapterRow[];
  activeId: string;
  onSelect(id: string): void;
  onSave(chapter: ChapterRow, title: string, body: string): void;
}

export function ChapterReader({ chapters, activeId, onSelect, onSave }: ChapterReaderProps) {
  const chapter = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const listPanel = useResizablePanel({ defaultWidth: 360, minWidth: 280, maxWidth: 480 });
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chapter.title);
  const [draftBody, setDraftBody] = useState(chapter.sourceBody);

  useEffect(() => {
    setEditing(false);
  }, [activeId]);

  useEffect(() => {
    setDraftTitle(chapter.title);
    setDraftBody(chapter.sourceBody);
  }, [chapter, editing]);

  const displayBody = chapter.sourceBody;

  const handleSave = () => {
    onSave(chapter, draftTitle.trim() || chapter.title, draftBody);
    setEditing(false);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <div style={{ width: listPanel.width, flex: 'none', overflow: 'auto' }}>
        {chapters.map((c) => (
          <div
            key={c.id}
            className="chapter-nav-item"
            style={{ padding: '9px 20.4px', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)', cursor: 'pointer', display: 'flex', gap: 10 }}
            onClick={() => onSelect(c.id)}
            data-active={c.id === chapter.id}
          >
            <span className="text-muted" style={{ fontSize: 12, width: 22, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{c.no}</span>
            <span style={{ fontSize: 13, lineHeight: 1.3 }}>{c.title}</span>
          </div>
        ))}
      </div>

      <div
        className={`panel-divider${listPanel.isDragging ? ' is-dragging' : ''}`}
        onMouseDown={listPanel.onDividerMouseDown}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ minHeight: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '8px 20.4px', borderBottom: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Chapter {chapter.no}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{chapter.title}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
            <span className="text-muted" style={{ fontSize: 12 }}>{countWords(chapter.sourceBody)} words</span>
            <div style={{ display: 'flex', border: '1px solid var(--color-divider)' }}>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setEditing(false)}
                style={{ border: 'none', borderRight: '1px solid var(--color-divider)', fontSize: 13, padding: '0 12px', height: 32, background: !editing ? 'var(--color-accent)' : 'transparent', color: !editing ? 'var(--color-bg)' : 'var(--color-text)' }}
              >
                Read
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setEditing(true)}
                style={{ border: 'none', fontSize: 13, padding: '0 12px', height: 32, background: editing ? 'var(--color-accent)' : 'transparent', color: editing ? 'var(--color-bg)' : 'var(--color-text)' }}
              >
                Edit
              </button>
            </div>
            <button type="button" className="btn btn-primary" disabled={!editing} onClick={handleSave}>Save</button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '34px 20.4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720 }}>
            {!editing ? (
              <div style={{ fontSize: 16, lineHeight: 1.75 }}>
                {displayBody === '' ? (
                  <p className="text-muted" style={{ textWrap: 'pretty' }}>This chapter has no content yet.</p>
                ) : (
                  displayBody.split('\n').map((paragraph, i) => (
                    <p key={i} style={{ marginBottom: 16, textWrap: 'pretty' }}>{paragraph}</p>
                  ))
                )}
              </div>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 13.6 }}>
                  <label>Chapter title</label>
                  <input className="input" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                </div>
                <div className="field">
                  <label>Content — plain text, one paragraph per line</label>
                  <textarea className="input" style={{ minHeight: 420, fontSize: 15, lineHeight: 1.7 }} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Saving replaces the content stored for this chapter. Re-importing this item's package would discard manual changes.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
