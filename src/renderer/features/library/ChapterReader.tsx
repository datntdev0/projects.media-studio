import { useEffect, useState } from 'react';
import { TranslateIcon } from '../../components/icons';
import { bodyFor, CHAPTER_LANG_NAME, CHAPTER_LANGS, countWords, hasTranslation, type ChapterLang, type ChapterRow } from './chapter';

interface ChapterReaderProps {
  chapters: ChapterRow[];
  activeId: string;
  onSelect(id: string): void;
  lang: ChapterLang;
  sourceLang: ChapterLang | undefined;
  onLangChange(lang: ChapterLang): void;
  onSave(chapter: ChapterRow, title: string, body: string): void;
}

export function ChapterReader({ chapters, activeId, onSelect, lang, sourceLang, onLangChange, onSave }: ChapterReaderProps) {
  const chapter = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chapter.title);
  const [draftBody, setDraftBody] = useState(bodyFor(chapter, lang));

  useEffect(() => {
    setEditing(false);
  }, [activeId]);

  useEffect(() => {
    setDraftTitle(chapter.title);
    setDraftBody(bodyFor(chapter, lang));
  }, [chapter, lang, editing]);

  const translated = lang !== sourceLang;
  const missingTranslation = translated && !hasTranslation(chapter, lang);
  const displayBody = bodyFor(chapter, lang);

  const handleSave = () => {
    onSave(chapter, draftTitle.trim() || chapter.title, draftBody);
    setEditing(false);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <div style={{ width: 260, flex: 'none', borderRight: '1px solid var(--color-divider)', overflow: 'auto' }}>
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

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ minHeight: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '8px 20.4px', borderBottom: '1px solid var(--color-divider)', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Chapter {chapter.no}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{chapter.title}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10.2 }}>
            <span className="text-muted" style={{ fontSize: 12 }}>{countWords(chapter.sourceBody)} words</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TranslateIcon width={15} height={15} style={{ color: 'var(--color-accent)' }} />
              <select className="input" style={{ width: 200, fontSize: 13 }} value={lang} onChange={(e) => onLangChange(e.target.value as ChapterLang)}>
                {CHAPTER_LANGS.map((code) => (
                  <option key={code} value={code}>
                    {code === sourceLang ? `${CHAPTER_LANG_NAME[code]} · source` : CHAPTER_LANG_NAME[code]}
                  </option>
                ))}
              </select>
            </div>
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
            {missingTranslation && (
              <div className="blueprint" style={{ padding: 13.6, marginBottom: 20.4 }}>
                <i className="corner tl" />
                <i className="corner tr" />
                <i className="corner bl" />
                <i className="corner br" />
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>No {CHAPTER_LANG_NAME[lang]} translation for this chapter yet</div>
                <div className="text-muted" style={{ fontSize: 12 }}>Showing the source. Switch to Edit and save to write one.</div>
              </div>
            )}
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
                  <label>{lang === sourceLang ? 'Content — plain text, one paragraph per line' : `${CHAPTER_LANG_NAME[lang]} translation — plain text, one paragraph per line`}</label>
                  <textarea className="input" style={{ minHeight: 420, fontSize: 15, lineHeight: 1.7 }} value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {lang === sourceLang
                    ? 'Saving replaces the source content stored for this chapter. Re-crawling this chapter will discard manual changes.'
                    : `Saving replaces the ${CHAPTER_LANG_NAME[lang]} translation stored for this chapter. The source chapter is left alone.`}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
