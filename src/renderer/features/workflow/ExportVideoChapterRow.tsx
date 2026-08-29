import { useState } from 'react';
import type { ExportVideoOutputChapter } from '../../../shared/app-workflow-activity';

interface ExportVideoChapterRowProps {
  chapter: ExportVideoOutputChapter;
  fetchSrt(chapterId: string): Promise<string | null>;
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

/** One Output-tab row for an exported chapter clip — a playable video up front, its srt subtitles fetched and shown on demand. */
export function ExportVideoChapterRow({ chapter, fetchSrt }: ExportVideoChapterRowProps) {
  const [open, setOpen] = useState(false);
  const [srt, setSrt] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && srt === undefined) {
      setLoading(true);
      fetchSrt(chapter.chapterId).then((result) => {
        setSrt(result);
        setLoading(false);
      });
    }
  };

  return (
    <div style={{ border: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px' }}>
        <button type="button" onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
          <span style={{ display: 'inline-block', flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: 9 }}>▶</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapter.title}</span>
        </button>
        <span className="text-muted" style={{ flex: 'none', fontSize: 11 }}>{formatDuration(chapter.durationSec)}</span>
      </div>

      <div style={{ padding: '0 10px 10px' }}>
        <video controls preload="none" src={chapter.videoUrl} style={{ width: '100%' }} />
      </div>

      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--color-divider)' }}>
          {loading ? (
            <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Loading…</div>
          ) : !srt ? (
            <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Subtitles not found.</div>
          ) : (
            <pre style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', padding: '8px 0', margin: 0, fontFamily: 'inherit' }}>{srt}</pre>
          )}
        </div>
      )}
    </div>
  );
}
