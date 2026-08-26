import { useState } from 'react';
import { DownloadIcon, RefreshIcon, ScrapingsIcon, UploadIcon } from '../../components/icons';
import { AppLibraryStatus, LibrarySourceMode, type AppLibrary } from '../../../shared/app-library';
import { ContentLanguage } from '../../../shared/app-library-content';
import type { CreateScrapingJobInput } from '../../../shared/app-scraping';
import { STATUS_TAG_CLASS, formatDate } from './libraryFormat';
import { DetailHeader } from './DetailHeader';
import { ChapterTable } from './ChapterTable';
import { ChapterReader } from './ChapterReader';
import { ScrapeDialog } from './ScrapeDialog';
import { ChapterFormDialog } from './ChapterFormDialog';
import { useLibraryContents } from './useLibraryContents';
import { buildChapterRows, resolveSourceLang, type ChapterLang, type ChapterRow } from './chapter';

interface NovelDetailScreenProps {
  item: AppLibrary;
  onBack(): void;
  onEdit(): void;
  onDelete(): void;
  onContentChange(): void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function NovelDetailScreen({ item, onBack, onEdit, onDelete, onContentChange }: NovelDetailScreenProps) {
  const novel = item.novelMetadata;
  const sourceLang = resolveSourceLang(novel?.language ?? '');

  const { contents, addChapter, saveChapter, removeChapter, removeChapters, discoverChapters } = useLibraryContents(item.id, item.status === AppLibraryStatus.Scraping);
  const [lang, setLang] = useState<ChapterLang>(sourceLang ?? ContentLanguage.English);
  const [activeChapterId, setActiveChapterId] = useState<string | undefined>(undefined);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [addChapterOpen, setAddChapterOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMessage, setDiscoverMessage] = useState<string | undefined>(undefined);
  const [discoverError, setDiscoverError] = useState<string | undefined>(undefined);

  const isCrawler = item.sourceMode === LibrarySourceMode.Crawler;
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

  const handleCreateScrapingJob = async (input: CreateScrapingJobInput) => {
    await window.appScrapingApi.createJob(input);
    onContentChange();
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoverError(undefined);
    setDiscoverMessage(undefined);
    try {
      const result = await discoverChapters();
      setDiscoverMessage(result.newChapters > 0 ? `Found ${result.newChapters} new chapter${result.newChapters === 1 ? '' : 's'}.` : 'No new chapters found.');
      if (result.newChapters > 0) onContentChange();
    } catch (err) {
      setDiscoverError(errorMessage(err));
    } finally {
      setDiscovering(false);
    }
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
        <div style={{ width: 320, flex: 'none', borderRight: '1px solid var(--color-divider)', paddingRight: 20.4, overflow: 'auto' }}>
          <div className={`blueprint${item.coverUrl ? '' : ' wireframe'}`} style={{ aspectRatio: '3/4', marginBottom: 20.4, position: 'relative', overflow: 'hidden' }}>
            <i className="corner tl" />
            <i className="corner tr" />
            <i className="corner bl" />
            <i className="corner br" />
            {item.coverUrl && <img src={item.coverUrl} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <h3 style={{ margin: '0 0 2px' }}>{item.title}</h3>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 10.2 }}>{novel?.author || 'No author recorded'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13.6 }}>
            {novel?.genres.map((genre) => (
              <span key={genre} className="tag tag-neutral">{genre}</span>
            ))}
          </div>
          <dl style={{ margin: 0, fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 13.6px' }}>
            <dt className="text-muted">Status</dt>
            <dd style={{ margin: 0 }}><span className={`tag ${STATUS_TAG_CLASS[item.status]}`}>{item.status}</span></dd>
            <dt className="text-muted">Chapters</dt>
            <dd style={{ margin: 0 }}>{novel ? `${novel.downloadedCount < novel.discoveredCount ? `${novel.downloadedCount} / ${novel.discoveredCount}` : novel.downloadedCount} ch.` : '—'}</dd>
            <dt className="text-muted">Mode</dt>
            <dd style={{ margin: 0 }}>{isCrawler ? 'Crawler' : 'Manual'}</dd>
            <dt className="text-muted">Crawler</dt>
            <dd style={{ margin: 0 }}>{isCrawler ? item.sourceName : '—'}</dd>
            <dt className="text-muted">Language</dt>
            <dd style={{ margin: 0 }}>{novel?.language || '—'}</dd>
            <dt className="text-muted">Updated</dt>
            <dd style={{ margin: 0 }}>{formatDate(item.updatedAt)}</dd>
            <dt className="text-muted">Source</dt>
            <dd style={{ margin: 0, wordBreak: 'break-all' }}>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}</a> : '—'}</dd>
          </dl>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6.8, marginTop: 20.4 }}>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setScrapeOpen(true)} disabled={!isCrawler} style={{ marginTop: 0, gap: 6 }}>
              <ScrapingsIcon width={15} height={15} />
              Scrape content…
            </button>
            <button type="button" className="btn btn-secondary btn-block" onClick={handleDiscover} disabled={!isCrawler || discovering} style={{ marginTop: 0, gap: 6 }}>
              <RefreshIcon width={15} height={15} />
              {discovering ? 'Checking source…' : 'Discover new chapters'}
            </button>
            {discoverError ? (
              <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.4, margin: '-2px 0 4px', color: '#8a2f2f' }}>{discoverError}</div>
            ) : discoverMessage ? (
              <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.4, margin: '-2px 0 4px' }}>{discoverMessage}</div>
            ) : (
              <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.4, margin: '-2px 0 4px' }}>Discovery only checks the source for new chapter links — it does not download content.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6.8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => {}} style={{ marginTop: 0, gap: 6, justifyContent: 'center', fontSize: 13 }}>
                <DownloadIcon width={15} height={15} />
                Export .zip
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => {}} style={{ marginTop: 0, gap: 6, justifyContent: 'center', fontSize: 13 }}>
                <UploadIcon width={15} height={15} />
                Import…
              </button>
            </div>
            <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.4, margin: '-2px 0 4px' }}>Export packs metadata, chapters and translations into a .zip. Import accepts a zip exported from any workspace.</div>
            <button type="button" className="btn btn-secondary btn-block" onClick={onEdit} style={{ marginTop: 0 }}>Edit metadata</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={onDelete} style={{ marginTop: 0, color: '#8a2f2f', justifyContent: 'center' }}>Delete item</button>
          </div>
        </div>
        )}

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', paddingLeft: activeChapter ? 0 : 20.4 }}>
          {activeChapter ? (
            <ChapterReader
              chapters={chapters}
              activeId={activeChapter.id}
              onSelect={setActiveChapterId}
              lang={lang}
              sourceLang={sourceLang}
              onLangChange={setLang}
              onSave={handleSaveChapter}
            />
          ) : (
            <ChapterTable
              chapters={chapters}
              lang={lang}
              sourceLang={sourceLang}
              onLangChange={setLang}
              onOpen={setActiveChapterId}
              onDelete={handleDeleteChapter}
              onDeleteMany={handleDeleteMany}
              onScrape={() => setScrapeOpen(true)}
              onAddChapter={() => setAddChapterOpen(true)}
            />
          )}
        </div>
      </div>

      {scrapeOpen && <ScrapeDialog libraryId={item.id} chapters={chapters} onClose={() => setScrapeOpen(false)} onSubmit={handleCreateScrapingJob} />}
      {addChapterOpen && <ChapterFormDialog nextNo={nextNo} onClose={() => setAddChapterOpen(false)} onAdd={handleAddChapter} />}
    </div>
  );
}
