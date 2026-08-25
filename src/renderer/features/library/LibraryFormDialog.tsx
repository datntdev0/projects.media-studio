import { useState } from 'react';
import { BookIcon, EditIcon, GlobeIcon, ImageSetIcon, VideoSetIcon } from '../../components/icons';
import { AppLibraryType, LibrarySourceMode, NovelStatus, type AppLibrary, type CreateAppLibraryInput, type UpdateAppLibraryInput } from '../../../shared/app-library';

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function LibraryFormDialog({ item, onClose, onCreate, onUpdate }: LibraryFormDialogProps) {
  const isEdit = item !== undefined;

  const [step, setStep] = useState(1);
  const [type, setType] = useState<AppLibraryType>(item?.type ?? AppLibraryType.Novel);
  const [sourceMode, setSourceMode] = useState<LibrarySourceMode>(item?.sourceMode ?? LibrarySourceMode.Crawler);
  const [title, setTitle] = useState(item?.title ?? '');
  const [sourceName, setSourceName] = useState(item?.sourceName ?? '');
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? '');
  const [coverUrl, setCoverUrl] = useState(item?.coverUrl ?? '');
  const [novelStatus, setNovelStatus] = useState<NovelStatus>(item?.novelMetadata?.status ?? NovelStatus.Ongoing);
  const [novelAuthor, setNovelAuthor] = useState(item?.novelMetadata?.author ?? '');
  const [novelLanguage, setNovelLanguage] = useState(item?.novelMetadata?.language ?? '');
  const [novelGenres, setNovelGenres] = useState(item?.novelMetadata?.genres.join(', ') ?? '');
  const [novelDescription, setNovelDescription] = useState(item?.novelMetadata?.description ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const isNovel = type === AppLibraryType.Novel;
  const isCrawler = sourceMode === LibrarySourceMode.Crawler;
  const lastStep = isCrawler ? 3 : 2;

  const showShape = isEdit || step === 1;
  const showSource = !isEdit && isCrawler && step === 2;
  const showDetails = isEdit || (!isCrawler && step === 2) || (isCrawler && step === 3);

  const sourceValid = sourceName.trim() !== '' && sourceUrl.trim() !== '';
  const detailsValid = title.trim() !== '' && (!isNovel || (novelAuthor.trim() !== '' && novelLanguage.trim() !== ''));
  const canAdvance = showDetails ? detailsValid : showSource ? sourceValid : true;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(undefined);

    const novel = isNovel
      ? {
          status: novelStatus,
          author: novelAuthor.trim(),
          language: novelLanguage.trim(),
          genres: novelGenres
            .split(',')
            .map((genre) => genre.trim())
            .filter(Boolean),
          description: novelDescription.trim(),
        }
      : undefined;

    try {
      if (isEdit) {
        await onUpdate(item.id, { title: title.trim(), coverUrl: coverUrl.trim() || null, novel });
      } else {
        await onCreate({
          title: title.trim(),
          type,
          sourceMode,
          sourceName: isCrawler ? sourceName.trim() : 'Manual',
          sourceUrl: isCrawler ? sourceUrl.trim() || null : null,
          coverUrl: coverUrl.trim() || null,
          novel,
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

  const dialogTitle = isEdit ? 'Edit item' : step === 1 ? 'New library item' : showSource ? 'Choose a crawler and source' : 'Enter the metadata';
  const dialogHint = isEdit
    ? 'Everything writable about the item. What is left blank is cleared.'
    : step === 1
      ? 'Type and source mode cannot be changed after creation.'
      : showSource
        ? 'A crawler runner is not wired up yet — name the source and where it lives. The item still starts as a draft.'
        : 'You will add content to the item once it exists.';
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
                <label>Source name</label>
                <input className="input" value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="royalroad" autoFocus />
              </div>
              <div className="field">
                <label>Source URL</label>
                <input className="input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
              </div>
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

              <div style={{ width: 190, flex: 'none' }}>
                <div className="field">
                  <label>Cover URL</label>
                  <input className="input" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." />
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
