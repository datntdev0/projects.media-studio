import { useEffect, useState } from 'react';
import { BookIcon, CheckIcon, EditIcon, GlobeIcon, ImageSetIcon, VideoSetIcon } from '../../components/icons';
import { AppLibraryType, LibrarySourceMode, NovelStatus, type AppLibrary, type CreateAppLibraryInput, type NovelDetails, type UpdateAppLibraryInput } from '../../../shared/app-library';
import type { CrawlerDescriptor, ScrapingPreview } from '../../../shared/app-scraping';
import { CoverPicker } from './CoverPicker';

interface LibraryFormDialogProps {
  /** Present in edit mode — the item's type and source mode stay fixed, only its editable fields are shown. */
  item?: AppLibrary;
  onClose(): void;
  onCreate(input: CreateAppLibraryInput): Promise<unknown>;
  onUpdate(id: string, input: UpdateAppLibraryInput): Promise<unknown>;
}

const TYPE_OPTIONS: { type: AppLibraryType; Icon: typeof BookIcon; title: string; hint: string }[] = [
  { type: AppLibraryType.Novel, Icon: BookIcon, title: 'Novel', hint: 'Text, chapter by chapter' },
  { type: AppLibraryType.Image, Icon: ImageSetIcon, title: 'Image set', hint: 'Many images in one item' },
  { type: AppLibraryType.Video, Icon: VideoSetIcon, title: 'Video set', hint: 'Many clips in one item' },
];

const SOURCE_MODE_OPTIONS: { mode: LibrarySourceMode; Icon: typeof BookIcon; title: string; hint: string }[] = [
  { mode: LibrarySourceMode.Crawler, Icon: GlobeIcon, title: 'From a crawler', hint: 'Name the source and paste a URL. Content is pulled in later.' },
  { mode: LibrarySourceMode.Manual, Icon: EditIcon, title: 'Manually', hint: 'Enter the metadata yourself, then add content later.' },
];

const NOVEL_STATUS_ALIASES: Record<string, NovelStatus> = {
  ongoing: NovelStatus.Ongoing,
  complete: NovelStatus.Complete,
  completed: NovelStatus.Complete,
  hiatus: NovelStatus.Hiatus,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Maps what the crawler read for a novel onto the details a library item stores. */
function novelDetailsFromPreview(preview: ScrapingPreview): NovelDetails {
  const status = NOVEL_STATUS_ALIASES[(preview.novel.status ?? '').trim().toLowerCase()] ?? NovelStatus.Ongoing;
  return {
    status,
    author: preview.novel.author ?? '',
    language: '',
    genres: preview.novel.category ? [preview.novel.category] : [],
    description: preview.novel.description ?? '',
  };
}

function novelDetailsFromForm(status: NovelStatus, author: string, language: string, genres: string, description: string): NovelDetails {
  return {
    status,
    author: author.trim(),
    language: language.trim(),
    genres: genres
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean),
    description: description.trim(),
  };
}

export function LibraryFormDialog({ item, onClose, onCreate, onUpdate }: LibraryFormDialogProps) {
  const isEdit = item !== undefined;

  const [step, setStep] = useState(1);
  const [type, setType] = useState<AppLibraryType>(item?.type ?? AppLibraryType.Novel);
  const [sourceMode, setSourceMode] = useState<LibrarySourceMode>(item?.sourceMode ?? LibrarySourceMode.Crawler);
  const [title, setTitle] = useState(item?.title ?? '');
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? '');
  const [novelStatus, setNovelStatus] = useState<NovelStatus>(item?.novelMetadata?.status ?? NovelStatus.Ongoing);
  const [novelAuthor, setNovelAuthor] = useState(item?.novelMetadata?.author ?? '');
  const [novelLanguage, setNovelLanguage] = useState(item?.novelMetadata?.language ?? '');
  const [novelGenres, setNovelGenres] = useState(item?.novelMetadata?.genres.join(', ') ?? '');
  const [novelDescription, setNovelDescription] = useState(item?.novelMetadata?.description ?? '');

  const [crawlers, setCrawlers] = useState<CrawlerDescriptor[]>([]);
  const [crawlerName, setCrawlerName] = useState(item?.sourceName ?? '');
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);
  const [preview, setPreview] = useState<ScrapingPreview | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const isNovel = type === AppLibraryType.Novel;
  const isCrawler = sourceMode === LibrarySourceMode.Crawler;
  const lastStep = isCrawler ? 3 : 2;

  const showShape = isEdit || step === 1;
  const showSource = !isEdit && isCrawler && step === 2;
  const showDetails = isEdit || (!isCrawler && step === 2);
  const showReview = !isEdit && isCrawler && step === 3;

  useEffect(() => {
    if (isEdit || !isCrawler) return;
    let cancelled = false;
    window.appScrapingApi.getCrawlers(type).then((list) => {
      if (cancelled) return;
      setCrawlers(list);
      setCrawlerName((current) => (list.some((crawler) => crawler.name === current) ? current : list[0]?.name ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [type, isCrawler, isEdit]);

  useEffect(() => {
    if (isEdit || !isCrawler) return;
    setPreview(undefined);
    setPreviewError(undefined);
    setCoverUrl('');
  }, [crawlerName, sourceUrl, isEdit, isCrawler]);

  const handlePreview = async () => {
    if (!crawlerName || sourceUrl.trim() === '') return;
    setPreviewing(true);
    setPreviewError(undefined);
    try {
      const result = await window.appScrapingApi.preview(crawlerName, sourceUrl.trim());
      setPreview(result);
      setCoverUrl(result.novel.coverUrl ?? '');
    } catch (err) {
      setPreviewError(errorMessage(err));
      setPreview(undefined);
    } finally {
      setPreviewing(false);
    }
  };

  const sourceValid = crawlerName !== '' && sourceUrl.trim() !== '' && preview !== undefined;
  const detailsValid = title.trim() !== '' && (!isNovel || (novelAuthor.trim() !== '' && novelLanguage.trim() !== ''));
  const canAdvance = showReview ? true : showDetails ? detailsValid : showSource ? sourceValid : true;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(undefined);

    try {
      if (isEdit) {
        const novel = isNovel ? novelDetailsFromForm(novelStatus, novelAuthor, novelLanguage, novelGenres, novelDescription) : undefined;
        await onUpdate(item.id, { title: title.trim(), coverUrl: coverUrl.trim() || null, novel });
      } else if (isCrawler) {
        if (!preview) throw new Error('Preview the source before creating the item.');
        await onCreate({
          title: preview.novel.title || sourceUrl.trim(),
          type,
          sourceMode,
          sourceName: crawlerName,
          sourceUrl: sourceUrl.trim(),
          coverUrl: coverUrl.trim() || null,
          novel: isNovel ? novelDetailsFromPreview(preview) : undefined,
        });
      } else {
        await onCreate({
          title: title.trim(),
          type,
          sourceMode,
          sourceName: 'Manual',
          sourceUrl: null,
          coverUrl: coverUrl.trim() || null,
          novel: isNovel ? novelDetailsFromForm(novelStatus, novelAuthor, novelLanguage, novelGenres, novelDescription) : undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const handleAdvance = () => {
    if (isEdit || step >= lastStep) {
      handleSubmit();
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (isEdit || step === 1) {
      onClose();
      return;
    }
    setStep(step - 1);
  };

  const dialogTitle = isEdit
    ? 'Edit item'
    : step === 1
      ? 'New library item'
      : showReview
        ? 'Review before creating'
        : isCrawler
          ? 'Choose a crawler and source'
          : 'Enter the metadata';
  const dialogHint = isEdit
    ? 'Everything writable about the item. What is left blank is cleared.'
    : step === 1
      ? 'Type and source mode cannot be changed after creation.'
      : showReview
        ? 'This is what the item will be created with.'
        : isCrawler
          ? 'The crawler reads the metadata now; the content follows when the job that fetches it exists.'
          : 'You will add chapters and files after the item is created.';
  const stepLabel = isEdit ? '' : `Step ${step} of ${lastStep}`;
  const backLabel = isEdit || step === 1 ? 'Cancel' : 'Back';
  const nextLabel = isEdit ? 'Save changes' : step >= lastStep ? 'Create item' : 'Continue';

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(720px, 100%)', background: 'var(--color-bg)' }}>
        <div className="dialog-title">{dialogTitle}</div>
        <div className="text-muted" style={{ fontSize: 12, margin: '-4px 0 13.6px' }}>
          {dialogHint}
        </div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 20.4, maxHeight: '60vh', overflow: 'auto' }}>
          {showShape && (
            <>
              <div className="field">
                <label>Library type</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13.6, opacity: isEdit ? 0.45 : 1 }}>
                  {TYPE_OPTIONS.map(({ type: optType, Icon, title: optTitle, hint }) => (
                    <label
                      key={optType}
                      className="blueprint"
                      style={{ padding: 13.6, cursor: isEdit ? 'default' : 'pointer', display: 'block', background: type === optType ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent' }}
                    >
                      <i className="corner tl" />
                      <i className="corner tr" />
                      <i className="corner bl" />
                      <i className="corner br" />
                      <input type="radio" name="ctype" style={{ position: 'absolute', opacity: 0 }} checked={type === optType} disabled={isEdit} onChange={() => setType(optType)} />
                      <Icon width={18} height={18} />
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16, marginTop: 6 }}>{optTitle}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{hint}</div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>How is the content sourced?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13.6, opacity: isEdit ? 0.45 : 1 }}>
                  {SOURCE_MODE_OPTIONS.map(({ mode, Icon, title: optTitle, hint }) => (
                    <label
                      key={mode}
                      className="blueprint"
                      style={{ padding: 13.6, cursor: isEdit ? 'default' : 'pointer', display: 'block', background: sourceMode === mode ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent' }}
                    >
                      <i className="corner tl" />
                      <i className="corner tr" />
                      <i className="corner bl" />
                      <i className="corner br" />
                      <input type="radio" name="cmode" style={{ position: 'absolute', opacity: 0 }} checked={sourceMode === mode} disabled={isEdit} onChange={() => setSourceMode(mode)} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon width={17} height={17} />
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{optTitle}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{hint}</div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {showSource && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6 }}>
              <div className="field">
                <label>Crawler</label>
                {crawlers.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    No crawler is available for this library type yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10.2 }}>
                    {crawlers.map((crawler) => (
                      <label
                        key={crawler.name}
                        className="blueprint"
                        style={{
                          padding: '10.2px 13.6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          background: crawlerName === crawler.name ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                        }}
                      >
                        <i className="corner tl" />
                        <i className="corner tr" />
                        <i className="corner bl" />
                        <i className="corner br" />
                        <input
                          type="radio"
                          name="crawler"
                          style={{ position: 'absolute', opacity: 0 }}
                          checked={crawlerName === crawler.name}
                          onChange={() => setCrawlerName(crawler.name)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14 }}>{crawler.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            {crawler.baseUrl.replace(/^https?:\/\//, '')} · {TYPE_OPTIONS.find((option) => option.type === crawler.libraryType)?.title}
                          </div>
                        </div>
                        <span className="tag tag-accent">Available</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="field">
                <label>Resource URL</label>
                <div style={{ display: 'flex', gap: 6.8 }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://www.novel543.com/0413553971"
                    autoFocus
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    style={{ flex: 'none' }}
                    onClick={handlePreview}
                    disabled={!crawlerName || sourceUrl.trim() === '' || previewing}
                  >
                    {previewing ? 'Reading…' : 'Preview'}
                  </button>
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Reading a source takes a moment — it is fetched through a real browser.
                </div>
              </div>

              {previewError && (
                <div className="text-muted" style={{ fontSize: 12, color: '#8a2f2f' }}>
                  {previewError}
                </div>
              )}

              {preview && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-accent-700)' }}>
                  <CheckIcon width={14} height={14} />
                  {crawlerName} read it · {preview.chapterCount} chapters detected
                </div>
              )}
            </div>
          )}

          {showDetails && (
            <div style={{ display: 'flex', gap: 20.4 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 13.6 }}>
                <div className="field">
                  <label>Title</label>
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="The Silent Cartographer" />
                </div>

                {isNovel && (
                  <>
                    <div className="field">
                      <label>Author</label>
                      <input className="input" value={novelAuthor} onChange={(e) => setNovelAuthor(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 13.6 }}>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Novel status</label>
                        <select className="input" value={novelStatus} onChange={(e) => setNovelStatus(e.target.value as NovelStatus)}>
                          <option value={NovelStatus.Ongoing}>Ongoing</option>
                          <option value={NovelStatus.Complete}>Complete</option>
                          <option value={NovelStatus.Hiatus}>Hiatus</option>
                        </select>
                      </div>
                      <div className="field" style={{ flex: 1 }}>
                        <label>Language</label>
                        <input className="input" value={novelLanguage} onChange={(e) => setNovelLanguage(e.target.value)} placeholder="en" />
                      </div>
                    </div>
                    <div className="field">
                      <label>Genres</label>
                      <input className="input" value={novelGenres} onChange={(e) => setNovelGenres(e.target.value)} placeholder="fantasy, adventure" />
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea className="input" style={{ minHeight: 70 }} value={novelDescription} onChange={(e) => setNovelDescription(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div style={{ width: 150, flex: 'none' }}>
                <CoverPicker value={coverUrl} onChange={setCoverUrl} alt={title || 'Cover'} />
              </div>
            </div>
          )}

          {showReview && preview && (
            <div style={{ display: 'flex', gap: 20.4 }}>
              <div style={{ flex: 'none' }}>
                <CoverPicker value={coverUrl} onChange={setCoverUrl} alt={preview.novel.title} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card-kicker">Fetched from {crawlerName}</div>
                <h4 style={{ margin: '2px 0 2px' }}>{preview.novel.title}</h4>
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 10.2 }}>
                  {[preview.novel.author, preview.novel.category, preview.novel.status].filter(Boolean).join(' · ')}
                </div>
                <dl style={{ margin: 0, fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 13.6px' }}>
                  <dt className="text-muted">Found</dt>
                  <dd style={{ margin: 0 }}>{preview.chapterCount} chapters</dd>
                  <dt className="text-muted">Latest</dt>
                  <dd style={{ margin: 0 }}>{preview.latestChapterTitle ?? '—'}</dd>
                  <dt className="text-muted">Source</dt>
                  <dd style={{ margin: 0 }}>{sourceUrl.trim()}</dd>
                </dl>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 13.6 }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    The item is created as a draft — the job that pulls this content comes later.
                  </span>
                  <button className="btn btn-ghost" type="button" style={{ marginLeft: 'auto', gap: 6, fontSize: 12 }} onClick={handlePreview} disabled={previewing}>
                    Re-read source
                  </button>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-muted" style={{ color: '#8a2f2f', fontSize: 12 }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8, paddingTop: 13.6, borderTop: '1px solid var(--color-divider)', marginTop: 13.6 }}>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {stepLabel}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8 }}>
            <button className="btn btn-secondary" type="button" onClick={handleBack} disabled={submitting}>
              {backLabel}
            </button>
            <button className="btn btn-primary" type="button" onClick={handleAdvance} disabled={!canAdvance || submitting}>
              {nextLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
