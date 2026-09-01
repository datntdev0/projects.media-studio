import { useState } from 'react';
import { useResizablePanel } from '../../components/useResizablePanel';
import type { AppLibrary } from '../../../shared/app-library';
import { ContentLanguage } from '../../../shared/app-library-content';
import { formatDate } from './libraryFormat';
import { DetailHeader } from './DetailHeader';
import { ChapterTable } from './ChapterTable';
import { ChapterReader } from './ChapterReader';
import { ChapterFormDialog } from './ChapterFormDialog';
import { useLibraryContents } from './useLibraryContents';
import { buildChapterRows, CHAPTER_LANG_NAME, resolveSourceLang, type ChapterRow } from './chapter';

interface NovelDetailScreenProps {
  item: AppLibrary;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  onContentChange(): void;
}

export function NovelDetailScreen({ item, onBack, onEdit, onDelete, onContentChange }: NovelDetailScreenProps) {
  const novel = item.novelMetadata;
  const sourceLang = resolveSourceLang(novel?.language ?? '');

  const { contents, addChapter, saveChapter, removeChapter, removeChapters } = useLibraryContents(item.id);
  const detailPanel = useResizablePanel({ defaultWidth: 280, minWidth: 280, maxWidth: 640 });
  // The item's own language, and the only one its chapters are read and written in now that
  // there is no language picker to switch away from it.
  const lang = sourceLang ?? ContentLanguage.English;
  const [activeChapterId, setActiveChapterId] = useState<string | undefined>(undefined);
  const [addChapterOpen, setAddChapterOpen] = useState(false);

  const chapters = buildChapterRows(contents, lang);
  const nextNo = chapters.length === 0 ? 1 : Math.max(...chapters.map((c) => c.no)) + 1;
  const activeChapter = chapters.find((c) => c.id === activeChapterId);

  const handleAddChapter = async (title: string) => {
    await addChapter(title, sourceLang ?? ContentLanguage.English);
    onContentChange();
    setAddChapterOpen(false);
  };

  const handleDeleteChapter = async (chapter: ChapterRow) => {
    await removeChapter(chapter);
    onContentChange();
  };

  const handleDeleteMany = async (selected: ChapterRow[]) => {
    await removeChapters(selected);
    onContentChange();
  };

  const handleSaveChapter = async (chapter: ChapterRow, title: string, body: string) => {
    await saveChapter(chapter, lang, title, body);
    onContentChange();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20.4, height: '100%' }}>
      {activeChapter ? (
        <DetailHeader backLabel={item.title} onBack={() => setActiveChapterId(undefined)} title={activeChapter.title} />
      ) : (
        <DetailHeader backLabel="Library" onBack={onBack} title={item.title} />
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {!activeChapter && (
        <div style={{ width: detailPanel.width, flex: 'none', paddingRight: 20.4, overflow: 'auto' }}>
          <div className={`blueprint${item.coverUrl ? '' : ' wireframe'}`} style={{ aspectRatio: '3/4', marginBottom: 20.4, position: 'relative', overflow: 'hidden' }}>
            {item.coverUrl &&<img src={item.coverUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <h3 style={{ margin: '0 0 2px' }}>{item.title}</h3>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 10.2 }}>{novel?.author || 'No author recorded'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13.6 }}>
            {novel?.genres.map((genre) => (
              <span key={genre} className="tag tag-outline">{genre}</span>
            ))}
          </div>
          <dl style={{ margin: 0, fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 13.6px' }}>
            <dt className="text-muted">Chapters</dt>
            <dd style={{ margin: 0 }}>{novel ? `${novel.downloadedCount < novel.discoveredCount ? `${novel.downloadedCount} / ${novel.discoveredCount}` : novel.downloadedCount} ch.` : '—'}</dd>
            <dt className="text-muted">Language</dt>
            {/* Named, not coded: the stored value is a code like `zh`, which reads as nothing on its own. */}
            <dd style={{ margin: 0 }}>{sourceLang ? CHAPTER_LANG_NAME[sourceLang] : novel?.language || '—'}</dd>
            <dt className="text-muted">Updated</dt>
            <dd style={{ margin: 0 }}>{formatDate(item.updatedAt)}</dd>
          </dl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6.8, marginTop: 20.4 }}>
            <button type="button" className="btn btn-secondary btn-block" onClick={onEdit} style={{ marginTop: 0 }}>Edit metadata</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={onDelete} style={{ marginTop: 0, color: '#8a2f2f', justifyContent: 'center' }}>Delete item</button>
          </div>
        </div>
        )}

        {!activeChapter && (
          <div
            className={`panel-divider${detailPanel.isDragging ? ' is-dragging' : ''}`}
            onMouseDown={detailPanel.onDividerMouseDown}
          />
        )}

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: activeChapter ? 0 : 20.4 }}>
          {activeChapter ? (
            <ChapterReader
              chapters={chapters}
              activeId={activeChapter.id}
              onSelect={setActiveChapterId}
              onSave={handleSaveChapter}
            />
          ) : (
            <ChapterTable
              chapters={chapters}
              onOpen={setActiveChapterId}
              onDelete={handleDeleteChapter}
              onDeleteMany={handleDeleteMany}
              onAddChapter={() => setAddChapterOpen(true)}
            />
          )}
        </div>
      </div>

      {addChapterOpen && <ChapterFormDialog nextNo={nextNo} onClose={() => setAddChapterOpen(false)} onAdd={handleAddChapter} />}
    </div>
  );
}
