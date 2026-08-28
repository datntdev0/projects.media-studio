import { useState } from 'react';
import type { TranslateOutputChapter } from '../../../shared/app-workflow-activity';

interface TranslateChapterRowProps {
  chapter: TranslateOutputChapter;
  fetchText(chapterId: string): Promise<string | null>;
}

/** One Output-tab row for a translated chapter — expands to fetch and show its full translated text on demand, so a long novel's Output tab never loads every chapter's text up front. */
export function TranslateChapterRow({ chapter, fetchText }: TranslateChapterRowProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && text === undefined) {
      setLoading(true);
      fetchText(chapter.chapterId).then((result) => {
        setText(result);
        setLoading(false);
      });
    }
  };

  return (
    <div style={{ border: '1px solid var(--color-divider)' }}>
      <button type="button" onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'inline-block', flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: 9 }}>▶</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</span>
        <span className="text-muted" style={{ flex: 'none', fontSize: 11 }}>{chapter.wordCount.toLocaleString()} words</span>
      </button>

      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--color-divider)' }}>
          {loading ? (
            <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Loading…</div>
          ) : !text ? (
            <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Translated text not found.</div>
          ) : (
            <div style={{ fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', padding: '8px 0' }}>{text}</div>
          )}
        </div>
      )}
    </div>
  );
}
