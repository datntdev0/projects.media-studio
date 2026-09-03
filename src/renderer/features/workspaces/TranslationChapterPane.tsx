import { useEffect, useState } from 'react';
import { LANGUAGE_NAME, TRANSLATION_LANGUAGE, type WorkspaceChapterTranslation, type WorkspaceTranslationChapter } from '@/shared/app-workspace-translation';
import { chapterRailTagOf } from './translationFormat';
import { paragraphsOf } from './worldFormat';
import { ChapterRail } from './ChapterRail';

interface TranslationChapterPaneProps {
  workspaceId: string;
  chapters: WorkspaceTranslationChapter[];
}

const LANGUAGE = LANGUAGE_NAME[TRANSLATION_LANGUAGE];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The chapter's paragraphs as the reading pane shows them. */
function Reading({ text, muted }: { text: string; muted: boolean }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: muted ? 'color-mix(in srgb, var(--color-text) 80%, transparent)' : undefined }}>
      {paragraphsOf(text).map((paragraph, at) => (
        <p key={at} style={{ margin: '0 0 12px', textWrap: 'pretty' }}>{paragraph}</p>
      ))}
    </div>
  );
}

/**
 * The step's chapter tab: the novel's chapters down the side, and the one picked
 * shown source beside translation, readable or editable. Editing overwrites the
 * step's own output — a chapter translated again by a later run is not, since a
 * run skips a chapter that already has a translation.
 */
export function TranslationChapterPane({ workspaceId, chapters }: TranslationChapterPaneProps) {
  const [selected, setSelected] = useState<number | undefined>(() => chapters.find((chapter) => chapter.extracted)?.idx);
  const [chapter, setChapter] = useState<WorkspaceChapterTranslation | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const picked = chapters.find((candidate) => candidate.idx === selected);
  // Re-read when a run translates the picked chapter under the screen, but never over an edit in progress.
  const translated = picked?.translated ?? false;

  useEffect(() => {
    if (selected === undefined || editing) return;
    window.appWorkspaceTranslationApi
      .readChapter(workspaceId, selected)
      .then((next) => {
        setChapter(next);
        setText(next.translated ?? '');
        setError(undefined);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [workspaceId, selected, translated, editing]);

  const save = async () => {
    if (selected === undefined) return;
    try {
      const next = await window.appWorkspaceTranslationApi.saveChapter(workspaceId, selected, text);
      setChapter(next);
      setEditing(false);
    } catch (err: unknown) {
      setError(errorMessage(err));
    }
  };

  const pick = (idx: number) => {
    setSelected(idx);
    setEditing(false);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <ChapterRail
        rows={chapters.map((entry) => ({ idx: entry.idx, title: entry.title, tag: chapterRailTagOf(entry) }))}
        selected={selected}
        onPick={pick}
        note="Greyed chapters were not extracted — analysis must succeed for them before translation."
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!chapter ? (
          <div className="text-muted" style={{ padding: 20.4, fontSize: 13 }}>{error ?? (selected === undefined ? 'No chapter has been extracted yet.' : 'Opening the chapter…')}</div>
        ) : (
          <>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '10.2px 20.4px', borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ minWidth: 0 }}>
                <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Chapter {chapter.idx}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{chapter.titleTranslated || chapter.title}</div>
                {chapter.titleTranslated && <div className="text-muted" style={{ fontSize: 12 }}>{chapter.title}</div>}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8, alignItems: 'center' }}>
                {error && <span className="tag tag-outline" title={error}>Save failed</span>}
                <div className="seg">
                  <label className="seg-opt">
                    <input type="radio" name="tr-mode" style={{ display: 'none' }} checked={!editing} onChange={() => setEditing(false)} />
                    <span>Read</span>
                  </label>
                  <label className="seg-opt">
                    <input type="radio" name="tr-mode" style={{ display: 'none' }} checked={editing} disabled={chapter.translated === null} onChange={() => setEditing(true)} />
                    <span>Edit</span>
                  </label>
                </div>
                {editing && <button type="button" className="btn btn-primary" style={{ fontSize: 13 }} onClick={save}>Save edits</button>}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20.4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20.4, alignItems: 'start' }}>
                <div>
                  <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Source · read-only</div>
                  {chapter.source ? <Reading text={chapter.source} muted /> : <div className="text-muted" style={{ fontSize: 13 }}>The working copy has no text for this chapter — it is laid out when the workspace is executed.</div>}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{LANGUAGE}</span>
                    {chapter.translated !== null && <span className="tag tag-accent-2" style={{ fontSize: 10, padding: '1px 6px' }}>Machine translated</span>}
                  </div>
                  {chapter.translated === null ? (
                    <div className="text-muted" style={{ fontSize: 13 }}>Not translated yet — the step translates it on the next execution over this chapter.</div>
                  ) : editing ? (
                    <>
                      <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 380, fontSize: 14, lineHeight: 1.7, width: '100%' }} />
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 7 }}>Edits overwrite the machine translation. Delete the chapter's .{TRANSLATION_LANGUAGE}.txt to have a run translate it afresh.</div>
                    </>
                  ) : (
                    <Reading text={chapter.translated} muted={false} />
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
