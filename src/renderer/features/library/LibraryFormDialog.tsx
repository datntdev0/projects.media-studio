import { useRef, useState } from 'react';
import { BookIcon, CheckIcon, EditIcon, ImageSetIcon, UploadIcon, VideoSetIcon } from '@/components/icons';
import { AppLibraryType, NovelStatus, type AppLibrary, type CreateAppLibraryInput, type NovelDetails, type UpdateAppLibraryInput } from '@/shared/app-library';
import type { LibraryPackagePreview } from '@/shared/app-library-package';
import { CHAPTER_LANG_NAME, CHAPTER_LANGS, resolveSourceLang } from './chapter';
import { NOVEL_STATUS_LABEL } from './libraryFormat';
import { CoverPicker } from './CoverPicker';

interface LibraryFormDialogProps {
  /** Present in edit mode — the item's type and source mode stay fixed, only its editable fields are shown. */
  item?: AppLibrary;
  onClose(): void;
  onCreate(input: CreateAppLibraryInput): Promise<unknown>;
  onUpdate(id: string, input: UpdateAppLibraryInput): Promise<unknown>;
  onImport(data: ArrayBuffer): Promise<unknown>;
}

/** How a new item comes into being — the dialog's own flow, not something the item records once created. */
type CreateMode = 'import' | 'manual';

const TYPE_OPTIONS: { type: AppLibraryType; Icon: typeof BookIcon; title: string; hint: string }[] = [
  { type: AppLibraryType.Novel, Icon: BookIcon, title: 'Novel', hint: 'Text, chapter by chapter' },
  { type: AppLibraryType.Image, Icon: ImageSetIcon, title: 'Image set', hint: 'Many images in one item' },
  { type: AppLibraryType.Video, Icon: VideoSetIcon, title: 'Video set', hint: 'Many clips in one item' },
];

const CREATE_MODE_OPTIONS: { mode: CreateMode; Icon: typeof BookIcon; title: string; hint: string }[] = [
  { mode: 'import', Icon: UploadIcon, title: 'From a .zip', hint: 'Import a package exported from this app, or written by the scraping script.' },
  { mode: 'manual', Icon: EditIcon, title: 'Manually', hint: 'Enter the metadata yourself, then add content later.' },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function typeTitle(type: AppLibraryType): string {
  return TYPE_OPTIONS.find((option) => option.type === type)?.title ?? type;
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

export function LibraryFormDialog({ item, onClose, onCreate, onUpdate, onImport }: LibraryFormDialogProps) {
  const isEdit = item !== undefined;

  const [step, setStep] = useState(1);
  const [type, setType] = useState<AppLibraryType>(item?.type ?? AppLibraryType.Novel);
  const [createMode, setCreateMode] = useState<CreateMode>('import');
  const [title, setTitle] = useState(item?.title ?? '');
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? '');
  const [novelStatus, setNovelStatus] = useState<NovelStatus>(item?.novelMetadata?.status ?? NovelStatus.Ongoing);
  const [novelAuthor, setNovelAuthor] = useState(item?.novelMetadata?.author ?? '');
  // An existing item may hold free text like "Chinese" — matched back to a code so the dropdown can show it.
  const [novelLanguage, setNovelLanguage] = useState<string>(resolveSourceLang(item?.novelMetadata?.language ?? '') ?? '');
  const [novelGenres, setNovelGenres] = useState(item?.novelMetadata?.genres.join(', ') ?? '');
  const [novelDescription, setNovelDescription] = useState(item?.novelMetadata?.description ?? '');

  const fileRef = useRef<HTMLInputElement>(null);
  const [packageData, setPackageData] = useState<ArrayBuffer | undefined>(undefined);
  const [packageName, setPackageName] = useState('');
  const [preview, setPreview] = useState<LibraryPackagePreview | undefined>(undefined);
  const [inspecting, setInspecting] = useState(false);
  const [previewError, setPreviewError] = useState<string | undefined>(undefined);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const isNovel = type === AppLibraryType.Novel;
  const isImport = !isEdit && createMode === 'import';
  const lastStep = isImport ? 3 : 2;

  const showShape = !isEdit && step === 1;
  const showUpload = isImport && step === 2;
  const showDetails = isEdit || (!isImport && step === 2);
  const showReview = isImport && step === 3;

  /** Reads the picked archive and asks the main process what importing it would create — nothing is written yet. */
  const handleFile = async (file: File) => {
    setInspecting(true);
    setPreviewError(undefined);
    setPreview(undefined);
    setPackageName(file.name);
    try {
      const data = await file.arrayBuffer();
      setPreview(await window.appLibraryPackageApi.inspect(data));
      setPackageData(data);
    } catch (err) {
      setPreviewError(errorMessage(err));
      setPackageData(undefined);
    } finally {
      setInspecting(false);
    }
  };

  const detailsValid = title.trim() !== '' && (!isNovel || (novelAuthor.trim() !== '' && novelLanguage.trim() !== ''));
  const canAdvance = showUpload ? preview !== undefined : showDetails ? detailsValid : true;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(undefined);

    try {
      if (isEdit) {
        const novel = isNovel ? novelDetailsFromForm(novelStatus, novelAuthor, novelLanguage, novelGenres, novelDescription) : undefined;
        await onUpdate(item.id, { title: title.trim(), coverUrl: coverUrl.trim() || null, novel });
      } else if (isImport) {
        if (!packageData) throw new Error('Choose a package to import first.');
        await onImport(packageData);
      } else {
        await onCreate({
          title: title.trim(),
          type,
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
        ? 'Review before importing'
        : isImport
          ? 'Choose a package'
          : 'Enter the metadata';
  const dialogHint = isEdit
    ? 'Everything writable about the item. What is left blank is cleared.'
    : step === 1
      ? 'Type and source mode cannot be changed after creation.'
      : showReview
        ? 'This is what the package will be imported as.'
        : isImport
          ? 'The package carries the metadata, the cover and the chapters already fetched.'
          : 'You will add chapters and files after the item is created.';
  const stepLabel = isEdit ? '' : `Step ${step} of ${lastStep}`;
  const backLabel = isEdit || step === 1 ? 'Cancel' : 'Back';
  const nextLabel = isEdit ? 'Save changes' : step < lastStep ? 'Continue' : isImport ? 'Import item' : 'Create item';

  const typeLocked = isImport;

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13.6, opacity: typeLocked ? 0.45 : 1 }}>
                  {TYPE_OPTIONS.map(({ type: optType, Icon, title: optTitle, hint }) => (
                    <label
                      key={optType}
                      className="blueprint"
                      style={{ padding: 13.6, cursor: typeLocked ? 'default' : 'pointer', display: 'block', background: type === optType ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent' }}
                    >
                      <input type="radio" name="ctype" style={{ position: 'absolute', opacity: 0 }} checked={type === optType} disabled={typeLocked} onChange={() => setType(optType)} />
                      <Icon width={18} height={18} />
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16, marginTop: 6 }}>{optTitle}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>{hint}</div>
                    </label>
                  ))}
                </div>
                {isImport && (
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                    The package decides the type — it is read from the file you choose next.
                  </div>
                )}
              </div>

              <div className="field">
                <label>How is the content sourced?</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13.6 }}>
                  {CREATE_MODE_OPTIONS.map(({ mode, Icon, title: optTitle, hint }) => (
                    <label
                      key={mode}
                      className="blueprint"
                      style={{ padding: 13.6, cursor: 'pointer', display: 'block', background: createMode === mode ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent' }}
                    >
                      <input type="radio" name="cmode" style={{ position: 'absolute', opacity: 0 }} checked={createMode === mode} onChange={() => setCreateMode(mode)} />
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

          {showUpload && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6 }}>
              <div className="field">
                <label>Package file</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) handleFile(file);
                  }}
                />
                <div style={{ display: 'flex', gap: 6.8, alignItems: 'center' }}>
                  <button className="btn btn-secondary" type="button" style={{ flex: 'none' }} onClick={() => fileRef.current?.click()} disabled={inspecting}>
                    {inspecting ? 'Reading…' : packageName ? 'Choose another…' : 'Choose a .zip…'}
                  </button>
                  <span className="text-muted" style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {packageName || 'No file chosen'}
                  </span>
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  A package holds library.json, the cover, and one .txt per chapter.
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
                  {preview.title} · {preview.chapterCount} chapters, {preview.bodyCount} with text
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13.6 }}>
                      <div className="field">
                        <label>Author</label>
                        <input className="input" value={novelAuthor} onChange={(e) => setNovelAuthor(e.target.value)} />
                      </div>
                      <div className="field">
                        <label>Status</label>
                        <select className="input" value={novelStatus} onChange={(e) => setNovelStatus(e.target.value as NovelStatus)}>
                          {Object.values(NovelStatus).map((status) => (
                            <option key={status} value={status}>{NOVEL_STATUS_LABEL[status]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Language</label>
                        <select className="input" value={novelLanguage} onChange={(e) => setNovelLanguage(e.target.value)}>
                          <option value="">Choose…</option>
                          {CHAPTER_LANGS.map((lang) => (
                            <option key={lang} value={lang}>{`${CHAPTER_LANG_NAME[lang]} (${lang})`}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="field">
                      <label>Genres</label>
                      <input className="input" value={novelGenres} onChange={(e) => setNovelGenres(e.target.value)} placeholder="fantasy, adventure" />
                    </div>
                    <div className="field">
                      <label>Description</label>
                      <textarea className="input" rows={10} value={novelDescription} onChange={(e) => setNovelDescription(e.target.value)} />
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
              <div style={{ width: 150, flex: 'none' }}>
                <div
                  className={`blueprint${preview.cover ? '' : ' wireframe'}`}
                  style={{ width: 150, aspectRatio: '3/4', position: 'relative', overflow: 'hidden' }}
                >
                  {preview.cover && (
                    <img src={preview.cover} alt={preview.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                  {preview.cover ? 'Cover from the package' : 'No cover in this package'}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card-kicker">Read from {packageName}</div>
                <h4 style={{ margin: '2px 0 2px' }}>{preview.title}</h4>
                <div className="text-muted" style={{ fontSize: 13, marginBottom: 10.2 }}>
                  {[preview.author, typeTitle(preview.type), preview.language].filter(Boolean).join(' · ')}
                </div>
                <dl style={{ margin: 0, fontSize: 13, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 13.6px' }}>
                  <dt className="text-muted">Chapters</dt>
                  <dd style={{ margin: 0 }}>
                    {preview.chapterCount} ({preview.bodyCount} with text)
                  </dd>
                </dl>

                {/* Capped and scrollable: a synopsis can run long, and it must not push the dialog's buttons out of reach. */}
                <div
                  className="text-muted"
                  style={{ fontSize: 12, lineHeight: 1.5, marginTop: 10.2, maxHeight: 108, overflowY: 'auto', whiteSpace: 'pre-line' }}
                >
                  {preview.description ?? 'This package carries no description.'}
                </div>

                <div className="text-muted" style={{ fontSize: 12, marginTop: 13.6 }}>
                  A new item is created — importing the same package again would add a second one.
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
