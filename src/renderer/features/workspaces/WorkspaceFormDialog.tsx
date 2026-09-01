import { useState } from 'react';
import { IllustrationIcon, TranslateIcon } from '@/components/icons';
import type { AppLibrary } from '@/shared/app-library';
import { StepAvailability, WORKSPACE_PRESET_STEPS, WorkspacePreset, WorkspaceStepKey, plannedStepsOf, type AppWorkspace, type CreateAppWorkspaceInput, type UpdateAppWorkspaceInput } from '@/shared/app-workspace';
import { PRESETS, STEP_NAME, orderLabelOf, presetMetaOf } from './workspaceFormat';

interface WorkspaceFormDialogProps {
  /** Present in edit mode — the preset, the novel and the pipeline stay fixed, only the name and description are shown. */
  workspace?: AppWorkspace;
  /** The library novels a workspace can run over — nothing else is eligible. */
  novels: AppLibrary[];
  onClose(): void;
  onCreate(input: CreateAppWorkspaceInput): Promise<unknown>;
  onUpdate(id: string, input: UpdateAppWorkspaceInput): Promise<unknown>;
}

const STEP_TITLE: Record<number, string> = {
  1: 'Choose a preset workflow',
  2: 'Pick a novel from the library',
  3: 'Workspace information',
};

const STEP_HINT: Record<number, string> = {
  1: 'Each preset is a fixed pipeline — the novel and the optional steps come next.',
  2: 'The novel stays in the library — the workspace references it.',
  3: 'Optional steps are fixed at creation. Review the pipeline, then create.',
};

interface OptionCardProps {
  Icon: typeof TranslateIcon;
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onToggle?(): void;
}

/** A small on/off card for one optional pipeline step. */
function OptionCard({ Icon, title, hint, checked, disabled = false, onToggle }: OptionCardProps) {
  return (
    <div
      className="blueprint"
      style={{
        padding: 10.2,
        opacity: disabled ? 0.5 : 1,
        borderStyle: disabled ? 'dashed' : 'solid',
        background: checked ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer' }}>
        <Icon width={16} height={16} />
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>{title}</span>
        <input
          type="checkbox"
          style={{ marginLeft: 'auto', accentColor: 'var(--color-accent)', width: 14, height: 14 }}
          checked={checked}
          disabled={disabled}
          onChange={() => onToggle?.()}
        />
      </label>
      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function defaultNameOf(novel: AppLibrary | undefined, preset: WorkspacePreset): string {
  if (!novel) return '';
  return `${novel.title} — ${preset === WorkspacePreset.AudioNovel ? 'Audio VN' : 'Video Recap'}`;
}

function novelOptionLabel(novel: AppLibrary): string {
  const parts = [`${novel.novelMetadata?.discoveredCount ?? 0} ch.`, novel.novelMetadata?.language].filter(Boolean);
  return `${novel.title} — ${parts.join(' · ')}`;
}

export function WorkspaceFormDialog({ workspace, novels, onClose, onCreate, onUpdate }: WorkspaceFormDialogProps) {
  const isEdit = workspace !== undefined;
  const [step, setStep] = useState(1);
  const [preset, setPreset] = useState<WorkspacePreset>(WorkspacePreset.AudioNovel);
  const [translateEnabled, setTranslateEnabled] = useState(true);
  const [libraryId, setLibraryId] = useState(novels[0]?.id ?? '');
  const [name, setName] = useState(workspace?.name ?? '');
  const [description, setDescription] = useState(workspace?.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const presetMeta = presetMetaOf(preset);
  const novel = novels.find((item) => item.id === libraryId);
  const metadata = novel?.novelMetadata ?? undefined;
  const missingContent = metadata !== undefined && metadata.downloadedCount < metadata.discoveredCount;
  const pipeline = plannedStepsOf(preset, translateEnabled);

  const canAdvance = isEdit || step === 3 ? name.trim() !== '' : step === 2 ? novel !== undefined : true;

  const handleAdvance = async () => {
    if (!isEdit && step < 3) {
      // Entering the last step the name starts derived from the novel — the user can still rewrite it.
      if (step === 2 && name.trim() === '') setName(defaultNameOf(novel, preset));
      setStep(step + 1);
      return;
    }

    setSubmitting(true);
    setError(undefined);
    try {
      if (workspace) {
        await onUpdate(workspace.id, { name: name.trim(), description: description.trim() });
      } else {
        await onCreate({ name: name.trim(), description: description.trim(), preset, libraryId, translateEnabled });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const handleBack = () => (isEdit || step === 1 ? onClose() : setStep(step - 1));

  const identityFields = (
    <>
      <div className="field">
        <label>Workspace name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Description — optional</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this workspace is for" />
      </div>
    </>
  );

  return (
    <div className="dialog-backdrop">
      <div className="dialog" style={{ width: 'min(720px, 100%)', background: 'var(--color-bg)' }}>
        {!isEdit && <div className="card-kicker">Step {step} of 3</div>}
        <div className="dialog-title">{isEdit ? 'Edit workspace' : STEP_TITLE[step]}</div>
        <div className="text-muted" style={{ fontSize: 12, margin: '-4px 0 13.6px' }}>{isEdit ? 'The preset, the novel and the pipeline are fixed at creation.' : STEP_HINT[step]}</div>

        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 20.4, maxHeight: '60vh', overflow: 'auto' }}>
          {isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6 }}>{identityFields}</div>
          )}

          {!isEdit && step === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13.6, alignItems: 'start' }}>
              {PRESETS.map(({ preset: optPreset, title, description: presetHint, Icon, available }) => (
                <label
                  key={optPreset}
                  className="blueprint"
                  style={{
                    padding: 13.6,
                    display: 'block',
                    cursor: available ? 'pointer' : 'default',
                    opacity: available ? 1 : 0.5,
                    borderStyle: available ? 'solid' : 'dashed',
                    background: preset === optPreset ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
                  }}
                >
                  <input type="radio" name="preset" style={{ position: 'absolute', opacity: 0 }} checked={preset === optPreset} disabled={!available} onChange={() => setPreset(optPreset)} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon width={17} height={17} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{title}</span>
                    {preset === optPreset && <span className="tag tag-accent" style={{ marginLeft: 'auto' }}>Selected</span>}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{presetHint}</div>
                </label>
              ))}
            </div>
          )}

          {!isEdit && step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13.6 }}>
              <div className="field">
                <label>Novel from library</label>
                <select className="input" value={libraryId} onChange={(e) => setLibraryId(e.target.value)} disabled={novels.length === 0}>
                  {novels.length === 0 ? (
                    <option value="">No novels in the library yet</option>
                  ) : (
                    novels.map((item) => (
                      <option key={item.id} value={item.id}>{novelOptionLabel(item)}</option>
                    ))
                  )}
                </select>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Only novels are eligible for the {presetMeta.title} preset — add one from the Library screen.
                </div>
              </div>

              {novel && (
                <div className="blueprint" style={{ padding: 13.6, display: 'flex', gap: 13.6 }}>
                  <div className={novel.coverUrl ? '' : 'wireframe'} style={{ width: 76, flex: 'none', aspectRatio: '3/4', border: '1px solid var(--color-divider)', overflow: 'hidden' }}>
                    {novel.coverUrl && <img src={novel.coverUrl} alt={novel.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{novel.title}</div>
                    <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                      {[metadata?.author, metadata?.language].filter(Boolean).join(' · ') || 'No author recorded'}
                    </div>
                    <dl style={{ margin: 0, fontSize: 12.5, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 13.6px' }}>
                      <dt className="text-muted">Chapters</dt>
                      <dd style={{ margin: 0 }}>{metadata?.discoveredCount ?? 0}</dd>
                      <dt className="text-muted">Content</dt>
                      <dd style={{ margin: 0 }}>{metadata?.downloadedCount ?? 0} with text</dd>
                    </dl>
                  </div>
                </div>
              )}

              {missingContent && (
                <div style={{ fontSize: 12, color: '#8a2f2f' }}>
                  Some chapters have no scraped content — those sub-steps will be blocked until content exists.
                </div>
              )}
            </div>
          )}

          {!isEdit && step === 3 && (
            <div style={{ display: 'flex', gap: 20.4 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 13.6 }}>
                {identityFields}
                <div className="field">
                  <label>Optional steps</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13.6, alignItems: 'stretch' }}>
                    <OptionCard
                      Icon={TranslateIcon}
                      title="Translate"
                      hint="Translates the analysed chapters before they are narrated."
                      checked={translateEnabled}
                      onToggle={() => setTranslateEnabled(!translateEnabled)}
                    />
                    <OptionCard
                      Icon={IllustrationIcon}
                      title="Illustration"
                      hint="Generates a frame per scene to accompany the narration. Coming soon."
                      checked={false}
                      disabled
                    />
                  </div>
                </div>
              </div>

              <div style={{ width: 230, flex: 'none' }}>
                <div className="field">
                  <label>Pipeline</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {WORKSPACE_PRESET_STEPS[preset].map(({ key, idx, availability }) => {
                      const on = pipeline.some((planned) => planned.key === key);
                      const tag = availability === StepAvailability.Soon ? 'Soon' : key === WorkspaceStepKey.SemanticTranslate ? (on ? 'On' : 'Off') : 'Required';
                      const tagClass = tag === 'On' ? 'tag-accent' : tag === 'Required' ? 'tag-neutral' : 'tag-outline';
                      return (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, opacity: on ? 1 : 0.5 }}>
                          <span style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', border: '1px solid var(--color-divider)', fontFamily: 'var(--font-heading)', fontSize: 10 }}>{orderLabelOf(idx)}</span>
                          <span style={{ flex: 1 }}>{STEP_NAME[key]}</span>
                          <span className={`tag ${tagClass}`} style={{ fontSize: 10, padding: '1px 6px' }}>{tag}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="text-muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 10 }}>
                  The workspace is created idle — execution is started separately, immediately or on a schedule.
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-muted" style={{ color: '#8a2f2f', fontSize: 12, marginTop: 13.6 }}>{error}</div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6.8, paddingTop: 13.6, borderTop: '1px solid var(--color-divider)', marginTop: 13.6 }}>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8 }}>
            <button className="btn btn-secondary" type="button" onClick={handleBack} disabled={submitting}>{isEdit || step === 1 ? 'Cancel' : 'Back'}</button>
            <button className="btn btn-primary" type="button" onClick={handleAdvance} disabled={!canAdvance || submitting}>{isEdit ? 'Save changes' : step === 3 ? 'Create workspace' : 'Continue'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
