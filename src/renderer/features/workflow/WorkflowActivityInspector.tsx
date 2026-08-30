import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, TrashIcon } from '../../components/icons';
import {
  ActivityChapterScope,
  AppWorkflowActivityType,
  PipelineStepStatus,
  type AnalyzeEngine,
  type AnalyzeOutput,
  type AnalyzeOutputCharacter,
  type AnalyzeOutputGlossaryEntry,
  type AnalyzeOutputTimelineGroup,
  type AppWorkflowActivity,
  type ChapterSelection,
  type ExportVideoOutput,
  type ExportVideoOutputChapter,
  type PipelineProgress,
  type TranslateOutput,
  type TranslateOutputChapter,
  type TtsOutput,
  type TtsOutputChapter,
  type UpdateAppWorkflowActivityInput,
} from '../../../shared/app-workflow-activity';
import { ContentLanguage, type AppLibraryContent } from '../../../shared/app-library-content';
import { LazySection } from './LazySection';
import { TranslateChapterRow } from './TranslateChapterRow';
import { TtsChapterRow } from './TtsChapterRow';
import { ExportVideoChapterRow } from './ExportVideoChapterRow';
import { ExportVideoImagePicker } from './ExportVideoImagePicker';
import {
  ACTIVITY_TYPE_META,
  ART_STYLES,
  CHAPTER_SCOPE_LABEL,
  ENGINE_LABEL,
  LANGUAGE_LABEL,
  PACES,
  VOICES,
  chaptersOf,
  withChapters,
  withEngine,
  withImageFile,
  withLanguage,
  withPace,
  withSoundWave,
  withStyle,
  withVoice,
  voiceSampleUrl,
} from './workflowActivityFormat';

interface WorkflowActivityInspectorProps {
  workflowId: string;
  activity: AppWorkflowActivity;
  activities: AppWorkflowActivity[];
  contents: AppLibraryContent[];
  /** The library's discovered chapter count — the ceiling for a chapter-range selection. */
  maxChapters: number;
  onUpdate(id: string, input: UpdateAppWorkflowActivityInput): void;
  onRemove(id: string): void;
  onClose(): void;
}

const TAB_LABEL = { general: 'General', input: 'Input', output: 'Output' } as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

const PROGRESS_POLL_MS = 2000;

function ProgressSteps({ progress }: { progress: PipelineProgress }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 16, border: '1px solid var(--color-divider)', padding: '4px 11px' }}>
      {progress.steps.map((step) => (
        <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
          {step.status === PipelineStepStatus.Done ? (
            <span style={{ width: 16, height: 16, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-300)', color: 'var(--color-accent-900)', display: 'grid', placeItems: 'center' }}>
              <CheckIcon width={10} height={10} />
            </span>
          ) : (
            <span
              style={{
                width: 8,
                height: 8,
                margin: 4,
                flex: 'none',
                borderRadius: '50%',
                background: step.status === PipelineStepStatus.Failed ? '#8a2f2f' : step.status === PipelineStepStatus.Running ? 'var(--color-accent)' : 'var(--color-divider)',
              }}
            />
          )}
          <span className={step.status === PipelineStepStatus.Pending ? 'text-muted' : undefined} style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            {step.label}
          </span>
          {step.detail && (
            <span className="text-muted" style={{ fontSize: 11, color: step.status === PipelineStepStatus.Failed ? '#8a2f2f' : undefined }}>
              {step.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The Export Video Output tab's final combined video — a player up front, its unified srt fetched and shown on demand. */
function ExportVideoCombinedPlayer({ workflowId, activityId, videoUrl }: { workflowId: string; activityId: string; videoUrl: string }) {
  const [open, setOpen] = useState(false);
  const [srt, setSrt] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && srt === undefined) {
      setLoading(true);
      window.appWorkflowActivityApi.getExportVideoSrt(workflowId, activityId).then((result) => {
        setSrt(result);
        setLoading(false);
      });
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <video controls preload="none" src={videoUrl} style={{ width: '100%' }} />
      <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: 11 }} onClick={toggle}>
        {open ? 'Hide subtitles' : 'Show subtitles'}
      </button>
      {open &&
        (loading ? (
          <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Loading…</div>
        ) : !srt ? (
          <div className="text-muted" style={{ fontSize: 12, padding: '8px 0' }}>Subtitles not found.</div>
        ) : (
          <pre style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', padding: '8px 0', margin: 0, fontFamily: 'inherit' }}>{srt}</pre>
        ))}
    </div>
  );
}

export function WorkflowActivityInspector({ workflowId, activity, activities, contents, maxChapters, onUpdate, onRemove, onClose }: WorkflowActivityInspectorProps) {
  const [tab, setTab] = useState<'general' | 'input' | 'output'>('general');
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [analyzeOutput, setAnalyzeOutput] = useState<AnalyzeOutput | null | undefined>(undefined);
  const [translateOutput, setTranslateOutput] = useState<TranslateOutput | null | undefined>(undefined);
  const [ttsOutput, setTtsOutput] = useState<TtsOutput | null | undefined>(undefined);
  const [exportVideoOutput, setExportVideoOutput] = useState<ExportVideoOutput | null | undefined>(undefined);
  const [progress, setProgress] = useState<PipelineProgress | null | undefined>(undefined);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setTab('general');
    setName(activity.name);
    setDescription(activity.description);
    setAnalyzeOutput(undefined);
    setTranslateOutput(undefined);
    setTtsOutput(undefined);
    setExportVideoOutput(undefined);
    setProgress(undefined);
  }, [activity.id]);

  useEffect(() => {
    const isPipeline =
      activity.type === AppWorkflowActivityType.Analyze ||
      activity.type === AppWorkflowActivityType.Translate ||
      activity.type === AppWorkflowActivityType.Tts ||
      activity.type === AppWorkflowActivityType.ExportVideo;
    if (tab !== 'output' || !isPipeline) return;
    let cancelled = false;

    const poll = () => {
      window.appWorkflowActivityApi.getPipelineProgress(workflowId, activity.id).then((result) => {
        if (!cancelled) setProgress(result);
      });
      if (activity.type === AppWorkflowActivityType.Analyze) {
        window.appWorkflowActivityApi.getAnalyzeOutput(workflowId, activity.id).then((result) => {
          if (!cancelled) setAnalyzeOutput(result);
        });
      } else if (activity.type === AppWorkflowActivityType.Translate) {
        window.appWorkflowActivityApi.getTranslateOutput(workflowId, activity.id).then((result) => {
          if (!cancelled) setTranslateOutput(result);
        });
      } else if (activity.type === AppWorkflowActivityType.ExportVideo) {
        window.appWorkflowActivityApi.getExportVideoOutput(workflowId, activity.id).then((result) => {
          if (!cancelled) setExportVideoOutput(result);
        });
      } else {
        window.appWorkflowActivityApi.getTtsOutput(workflowId, activity.id).then((result) => {
          if (!cancelled) setTtsOutput(result);
        });
      }
    };

    poll();
    const interval = setInterval(poll, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tab, workflowId, activity.id, activity.type]);

  const meta = ACTIVITY_TYPE_META[activity.type];
  const chapters = chaptersOf(activity);
  const upstream = activity.dependencies.map((id) => activities.find((a) => a.id === id)).filter((a): a is AppWorkflowActivity => a !== undefined);
  // An activity saved before VOICES/PACES last changed can hold a value neither list offers any more — fall back
  // to a valid default rather than leaving the <select> on a value with no matching <option>.
  const ttsVoice = activity.type === AppWorkflowActivityType.Tts && VOICES.includes(activity.ttsConfig!.voice) ? activity.ttsConfig!.voice : VOICES[0];
  const ttsPace = activity.type === AppWorkflowActivityType.Tts && PACES.includes(activity.ttsConfig!.pace) ? activity.ttsConfig!.pace : PACES[1];
  const exportVideoVoice = activity.type === AppWorkflowActivityType.ExportVideo && VOICES.includes(activity.exportVideoConfig!.voice) ? activity.exportVideoConfig!.voice : VOICES[0];
  const ttsSampleUrl =
    activity.type === AppWorkflowActivityType.Tts && activity.ttsConfig!.language === ContentLanguage.Vietnamese ? voiceSampleUrl(ttsVoice, ttsPace) : null;

  useEffect(() => {
    previewRef.current?.pause();
    setPreviewPlaying(false);
  }, [ttsSampleUrl]);

  const togglePreview = () => {
    const audio = previewRef.current;
    if (!audio) return;
    if (previewPlaying) {
      audio.pause();
    } else {
      audio.currentTime = 0;
      audio.play();
    }
  };

  const patchChapters = (patch: Partial<ChapterSelection>) => onUpdate(activity.id, { config: withChapters(activity, { ...chapters!, ...patch }) });

  const handleRemove = () => {
    if (!window.confirm(`Remove "${activity.name}" from this workflow?`)) return;
    onRemove(activity.id);
  };

  return (
    <div style={{ width: 560, flex: 'none', paddingLeft: '10.2px', borderLeft: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' }}>
      <div style={{ flex: 'none', padding: '13.6px 0 0 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{ width: 30, height: 30, flex: 'none', background: 'var(--color-accent-900)', color: 'var(--color-bg)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 12 }}>
            {meta.code}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.name}</div>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{meta.label}</div>
          </div>
          <button type="button" className="btn btn-secondary btn-icon" onClick={onClose} style={{ borderColor: 'transparent', width: 26, height: 26 }}>
            <CloseIcon width={15} height={15} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
          {(['general', 'input', 'output'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                flex: 1,
                padding: '9px 0',
                background: 'transparent',
                border: 0,
                borderBottom: `2px solid ${tab === key ? 'var(--color-accent)' : 'transparent'}`,
                color: tab === key ? 'var(--color-accent)' : 'inherit',
                fontFamily: 'var(--font-heading)',
                fontSize: 14,
                letterSpacing: '0.02em',
                cursor: 'pointer',
              }}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: '100%', display: 'flex', flexDirection: 'column', paddingTop: '16px' }}>
        {tab === 'general' && (
          <>
            <div className="field" style={{ marginBottom: 13.6 }}>
              <label htmlFor="activity-name">Name</label>
              <input className="input" id="activity-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== activity.name && onUpdate(activity.id, { name: name.trim() })} />
            </div>
            <div className="field" style={{ marginBottom: 13.6 }}>
              <label htmlFor="activity-desc">Description</label>
              <textarea
                className="input"
                id="activity-desc"
                style={{ minHeight: 74 }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => description !== activity.description && onUpdate(activity.id, { description })}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13.6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={activity.enabled}
                onChange={(e) => onUpdate(activity.id, { enabled: e.target.checked })}
                style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 13 }}>Enabled</span>
            </label>
            {!activity.enabled && (
              <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 13.6 }}>
                Disabled — the orchestrator skips this activity when the workflow runs, and moves on to its dependents.
              </div>
            )}

            <div className="card-kicker">Dependencies</div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upstream.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 12 }}>No dependency — this activity starts the run.</div>
              ) : (
                upstream.map((dep) => (
                  <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '7px 10px', border: '1px solid var(--color-divider)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Runs after <strong>{dep.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => onUpdate(activity.id, { dependencies: activity.dependencies.filter((id) => id !== dep.id) })}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 20.4, color: '#8a2f2f', gap: 6 }} onClick={handleRemove}>
              <TrashIcon width={14} height={14} />
              Remove activity
            </button>
          </>
        )}

        {tab === 'input' && chapters && (
          <>
            <div className="card-kicker">Chapters</div>
            <div className="seg" style={{ margin: '8px 0 10px', width: '100%' }}>
              {Object.values(ActivityChapterScope).map((scope) => (
                <label className="seg-opt" style={{ flex: 1 }} key={scope}>
                  <input type="radio" name="ascope" checked={chapters.scope === scope} onChange={() => patchChapters({ scope })} />
                  <span>{CHAPTER_SCOPE_LABEL[scope]}</span>
                </label>
              ))}
            </div>

            {chapters.scope === ActivityChapterScope.Range && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input className="input" type="number" min={1} max={maxChapters || undefined} value={chapters.rangeFrom} onChange={(e) => patchChapters({ rangeFrom: Number(e.target.value) })} style={{ width: 88 }} />
                <span className="text-muted" style={{ fontSize: 13 }}>to</span>
                <input className="input" type="number" min={1} max={maxChapters || undefined} value={chapters.rangeTo} onChange={(e) => patchChapters({ rangeTo: Number(e.target.value) })} style={{ width: 88 }} />
                <span className="text-muted" style={{ fontSize: 12 }}>of {maxChapters}</span>
              </div>
            )}

            {chapters.scope === ActivityChapterScope.Picked && (
              <div style={{ flex: 1, minHeight: 160, display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
                <div className="text-muted" style={{ flex: 'none', fontSize: 11, marginBottom: 6 }}>
                  {chapters.pickedContentIds.length} of {contents.length} picked
                </div>
                <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--color-divider)', overflow: 'auto' }}>
                  {contents.length === 0 ? (
                    <div className="text-muted" style={{ fontSize: 12, padding: '9px 11px' }}>This library has no chapters yet.</div>
                  ) : (
                    contents.map((c) => {
                      const checked = chapters.pickedContentIds.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 8%, transparent)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => patchChapters({ pickedContentIds: checked ? chapters.pickedContentIds.filter((id) => id !== c.id) : [...chapters.pickedContentIds, c.id] })}
                            style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                          />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{c.textContent?.title ?? `Chapter ${c.idx}`}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
            <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 16 }}>
              {chapters.scope === ActivityChapterScope.Missing ? 'Only chapters missing this activity’s output will run.' : 'Chosen chapters run every time this activity executes.'}
            </div>

            {activity.type === AppWorkflowActivityType.Analyze && (
              <>
                <div className="field" style={{ marginBottom: 13.6 }}>
                  <label htmlFor="activity-engine">Engine</label>
                  <select className="input" id="activity-engine" value={activity.analyzeConfig!.engine} onChange={(e) => onUpdate(activity.id, { config: withEngine(activity, e.target.value as AnalyzeEngine) })}>
                    {Object.entries(ENGINE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {activity.type === AppWorkflowActivityType.Translate && (
              <div style={{ display: 'flex', gap: 13.6, marginBottom: 13.6 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="activity-engine">Engine</label>
                  <select className="input" id="activity-engine" value={activity.translateConfig!.engine} onChange={(e) => onUpdate(activity.id, { config: withEngine(activity, e.target.value as AnalyzeEngine) })}>
                    {Object.entries(ENGINE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="activity-lang">Target language</label>
                  <select className="input" id="activity-lang" value={activity.translateConfig!.language} onChange={(e) => onUpdate(activity.id, { config: withLanguage(activity, e.target.value as ContentLanguage) })}>
                    {Object.entries(LANGUAGE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {activity.type === AppWorkflowActivityType.Storyboard && (
              <div className="field" style={{ marginBottom: 13.6 }}>
                <label htmlFor="activity-style">Illustration style</label>
                <select className="input" id="activity-style" value={activity.storyboardConfig!.style} onChange={(e) => onUpdate(activity.id, { config: withStyle(activity, e.target.value) })}>
                  {ART_STYLES.map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </div>
            )}

            {activity.type === AppWorkflowActivityType.Tts && (
              <>
                <div style={{ display: 'flex', gap: 13.6, marginBottom: 6, alignItems: 'flex-end' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="activity-voice">Voice</label>
                    <select className="input" id="activity-voice" value={ttsVoice} onChange={(e) => onUpdate(activity.id, { config: withVoice(activity, e.target.value) })}>
                      {VOICES.map((voice) => (
                        <option key={voice} value={voice}>{voice}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ width: 96 }}>
                    <label htmlFor="activity-pace">Pace</label>
                    <select className="input" id="activity-pace" value={ttsPace} onChange={(e) => onUpdate(activity.id, { config: withPace(activity, e.target.value) })}>
                      {PACES.map((pace) => (
                        <option key={pace} value={pace}>{pace}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    id="activity-voice-preview"
                    type="button"
                    className="btn btn-secondary btn-icon"
                    style={{ width: 34, height: 34, flex: 'none' }}
                    disabled={!ttsSampleUrl}
                    onClick={togglePreview}
                    title={ttsSampleUrl ? 'Preview this voice' : 'Sample only available for Vietnamese'}
                  >
                    {previewPlaying ? <PauseIcon width={14} height={14} /> : <PlayIcon width={14} height={14} />}
                  </button>
                  <audio ref={previewRef} src={ttsSampleUrl ?? undefined} onPlay={() => setPreviewPlaying(true)} onPause={() => setPreviewPlaying(false)} onEnded={() => setPreviewPlaying(false)} style={{ display: 'none' }} />
                </div>
                <div className="field" style={{ marginBottom: 13.6 }}>
                  <label htmlFor="activity-tts-lang">Language</label>
                  <select className="input" id="activity-tts-lang" value={activity.ttsConfig!.language} onChange={(e) => onUpdate(activity.id, { config: withLanguage(activity, e.target.value as ContentLanguage) })}>
                    {Object.entries(LANGUAGE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {activity.type === AppWorkflowActivityType.ExportVideo && (
              <>
                <div className="field" style={{ marginBottom: 13.6 }}>
                  <label htmlFor="activity-export-video-voice">Translated TTS</label>
                  <select className="input" id="activity-export-video-voice" value={exportVideoVoice} onChange={(e) => onUpdate(activity.id, { config: withVoice(activity, e.target.value) })}>
                    {VOICES.map((voice) => (
                      <option key={voice} value={voice}>{voice} — Vietnamese</option>
                    ))}
                  </select>
                </div>
                <ExportVideoImagePicker workflowId={workflowId} value={activity.exportVideoConfig!.imageFile} onChange={(imageFile) => onUpdate(activity.id, { config: withImageFile(activity, imageFile) })} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13.6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activity.exportVideoConfig!.soundWave}
                    onChange={(e) => onUpdate(activity.id, { config: withSoundWave(activity, e.target.checked) })}
                    style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 13 }}>Generate sound waves</span>
                </label>
                <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45, marginTop: 6 }}>
                  Overlays a waveform of the narration at the bottom center of the exported video.
                </div>
              </>
            )}
          </>
        )}

        {tab === 'input' && !chapters && activity.type === AppWorkflowActivityType.Profiles && (
          <div className="field" style={{ marginBottom: 13.6 }}>
            <label htmlFor="activity-style">Illustration style</label>
            <select className="input" id="activity-style" value={activity.profilesConfig!.style} onChange={(e) => onUpdate(activity.id, { config: withStyle(activity, e.target.value) })}>
              {ART_STYLES.map((style) => (
                <option key={style} value={style}>{style}</option>
              ))}
            </select>
          </div>
        )}

        {tab === 'output' && activity.type === AppWorkflowActivityType.Analyze && (
          <>
            {analyzeOutput === undefined && progress === undefined ? (
              <div className="text-muted" style={{ fontSize: 12 }}>Loading output…</div>
            ) : (
              <>
                {progress && <ProgressSteps progress={progress} />}

                {analyzeOutput ? (
                  <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'Characters', value: analyzeOutput.characterCount },
                    { label: 'Glossary terms', value: analyzeOutput.glossaryCount },
                    { label: 'Chapters mapped', value: analyzeOutput.chaptersCovered },
                    { label: 'Timeline groups', value: analyzeOutput.timelineGroupCount },
                  ].map((stat) => (
                    <div key={stat.label} className="blueprint" style={{ padding: '9px 11px' }}>
                      <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <LazySection<AnalyzeOutputCharacter>
                  key={`characters-${workflowId}-${activity.id}-${analyzeOutput.characterCount}`}
                  title="Characters"
                  count={analyzeOutput.characterCount}
                  emptyLabel="No characters found."
                  fetchPage={(offset, limit) => window.appWorkflowActivityApi.getAnalyzeCharacters(workflowId, activity.id, offset, limit)}
                  keyOf={(character) => character.name}
                  renderItem={(character) => (
                    <div style={{ display: 'flex', gap: 9, padding: '8px 10px', border: '1px solid var(--color-divider)' }}>
                      <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-300)', color: 'var(--color-accent-900)', display: 'grid', placeItems: 'center', fontSize: 11 }}>
                        {initials(character.name)}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13 }}>
                          {character.name} {character.aliasLabel && <span className="text-muted" style={{ fontSize: 11 }}>({character.aliasLabel})</span>}
                        </span>
                        {character.appearance && <span className="text-muted" style={{ display: 'block', fontSize: 11, lineHeight: 1.4, marginTop: 2 }}>{character.appearance}</span>}
                      </span>
                    </div>
                  )}
                />

                <LazySection<AnalyzeOutputGlossaryEntry>
                  key={`glossary-${workflowId}-${activity.id}-${analyzeOutput.glossaryCount}`}
                  title="Glossary"
                  count={analyzeOutput.glossaryCount}
                  emptyLabel="No glossary terms yet."
                  fetchPage={(offset, limit) => window.appWorkflowActivityApi.getAnalyzeGlossary(workflowId, activity.id, offset, limit)}
                  keyOf={(entry) => entry.term}
                  renderItem={(entry) => (
                    <div style={{ display: 'flex', gap: 9, padding: '8px 10px', border: '1px solid var(--color-divider)' }}>
                      <span style={{ flex: 'none', width: '38%', fontSize: 12 }}>{entry.term}</span>
                      <span className="text-muted" style={{ fontSize: 12 }}>{entry.definition}</span>
                    </div>
                  )}
                />

                <LazySection<AnalyzeOutputTimelineGroup>
                  key={`timeline-${workflowId}-${activity.id}-${analyzeOutput.timelineGroupCount}`}
                  title="Timeline"
                  count={analyzeOutput.timelineGroupCount}
                  emptyLabel="No timeline entries yet."
                  fetchPage={(offset, limit) => window.appWorkflowActivityApi.getAnalyzeTimeline(workflowId, activity.id, offset, limit)}
                  keyOf={(group) => group.chapterId}
                  renderItem={(group) => (
                    <div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 12 }}>{group.chapterId}</div>
                      <ul style={{ margin: '2px 0 0 16px', padding: 0, fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>
                        {group.scenes.map((scene, i) => (
                          <li key={i}>{scene}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                />
                  </>
                ) : analyzeOutput === null && progress === null ? (
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>This activity hasn’t produced output yet — run the workflow to build the world bible.</div>
                ) : null}
              </>
            )}
          </>
        )}

        {tab === 'output' && activity.type === AppWorkflowActivityType.Translate && (
          <>
            {translateOutput === undefined && progress === undefined ? (
              <div className="text-muted" style={{ fontSize: 12 }}>Loading output…</div>
            ) : (
              <>
                {progress && <ProgressSteps progress={progress} />}

                {translateOutput ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                      {[
                        { label: 'Target language', value: LANGUAGE_LABEL[translateOutput.language] },
                        { label: 'Chapters translated', value: `${translateOutput.chaptersTranslated} / ${translateOutput.totalChapters}` },
                        { label: 'Glossary', value: translateOutput.glossaryTranslated ? 'Translated' : 'Pending' },
                      ].map((stat) => (
                        <div key={stat.label} className="blueprint" style={{ padding: '9px 11px' }}>
                          <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    <LazySection<TranslateOutputChapter>
                      key={`translated-chapters-${workflowId}-${activity.id}-${translateOutput.chaptersTranslated}`}
                      title="Translated Chapters"
                      count={translateOutput.chaptersTranslated}
                      emptyLabel="No chapters translated yet."
                      fetchPage={(offset, limit) => window.appWorkflowActivityApi.getTranslateChapters(workflowId, activity.id, offset, limit)}
                      keyOf={(chapter) => chapter.chapterId}
                      renderItem={(chapter) => (
                        <TranslateChapterRow chapter={chapter} fetchText={(chapterId) => window.appWorkflowActivityApi.getTranslateChapterText(workflowId, activity.id, chapterId)} />
                      )}
                    />
                  </>
                ) : translateOutput === null && progress === null ? (
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>This activity hasn’t produced output yet — run the workflow to translate chapters.</div>
                ) : null}
              </>
            )}
          </>
        )}

        {tab === 'output' && activity.type === AppWorkflowActivityType.Tts && (
          <>
            {ttsOutput === undefined && progress === undefined ? (
              <div className="text-muted" style={{ fontSize: 12 }}>Loading output…</div>
            ) : (
              <>
                {progress && <ProgressSteps progress={progress} />}

                {ttsOutput ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                      {[
                        { label: 'Voice', value: `${ttsOutput.voice} · ${ttsOutput.pace}` },
                        { label: 'Chapters narrated', value: `${ttsOutput.chaptersGenerated} / ${ttsOutput.totalChapters}` },
                        { label: 'Language', value: LANGUAGE_LABEL[ttsOutput.language] },
                      ].map((stat) => (
                        <div key={stat.label} className="blueprint" style={{ padding: '9px 11px' }}>
                          <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    <LazySection<TtsOutputChapter>
                      key={`narrated-chapters-${workflowId}-${activity.id}-${ttsOutput.chaptersGenerated}`}
                      title="Narrated Chapters"
                      count={ttsOutput.chaptersGenerated}
                      emptyLabel="No chapters narrated yet."
                      fetchPage={(offset, limit) => window.appWorkflowActivityApi.getTtsChapters(workflowId, activity.id, offset, limit)}
                      keyOf={(chapter) => chapter.chapterId}
                      renderItem={(chapter) => (
                        <TtsChapterRow chapter={chapter} fetchSrt={(chapterId) => window.appWorkflowActivityApi.getTtsChapterSrt(workflowId, activity.id, chapterId)} />
                      )}
                    />
                  </>
                ) : ttsOutput === null && progress === null ? (
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>This activity hasn’t produced output yet — run the workflow to narrate chapters.</div>
                ) : null}
              </>
            )}
          </>
        )}

        {tab === 'output' && activity.type === AppWorkflowActivityType.ExportVideo && (
          <>
            {exportVideoOutput === undefined && progress === undefined ? (
              <div className="text-muted" style={{ fontSize: 12 }}>Loading output…</div>
            ) : (
              <>
                {progress && <ProgressSteps progress={progress} />}

                {exportVideoOutput ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 16 }}>
                      {[
                        { label: 'Translated TTS', value: exportVideoOutput.voice },
                        { label: 'Chapters exported', value: `${exportVideoOutput.chaptersExported} / ${exportVideoOutput.totalChapters}` },
                      ].map((stat) => (
                        <div key={stat.label} className="blueprint" style={{ padding: '9px 11px' }}>
                          <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 16 }}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="card-kicker" style={{ marginBottom: 8 }}>Combined video</div>
                    {exportVideoOutput.videoUrl ? (
                      <ExportVideoCombinedPlayer workflowId={workflowId} activityId={activity.id} videoUrl={exportVideoOutput.videoUrl} />
                    ) : (
                      <div className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>Not combined yet — the final video appears once every exported chapter has been muxed together.</div>
                    )}

                    <LazySection<ExportVideoOutputChapter>
                      key={`export-video-chapters-${workflowId}-${activity.id}-${exportVideoOutput.chaptersExported}`}
                      title="Exported Chapters"
                      count={exportVideoOutput.chaptersExported}
                      emptyLabel="No chapters exported yet."
                      fetchPage={(offset, limit) => window.appWorkflowActivityApi.getExportVideoChapters(workflowId, activity.id, offset, limit)}
                      keyOf={(chapter) => chapter.chapterId}
                      renderItem={(chapter) => (
                        <ExportVideoChapterRow chapter={chapter} fetchSrt={(chapterId) => window.appWorkflowActivityApi.getExportVideoChapterSrt(workflowId, activity.id, chapterId)} />
                      )}
                    />
                  </>
                ) : exportVideoOutput === null && progress === null ? (
                  <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>This activity hasn’t produced output yet — run the workflow to export chapters.</div>
                ) : null}
              </>
            )}
          </>
        )}

        {tab === 'output' &&
          activity.type !== AppWorkflowActivityType.Analyze &&
          activity.type !== AppWorkflowActivityType.Translate &&
          activity.type !== AppWorkflowActivityType.Tts &&
          activity.type !== AppWorkflowActivityType.ExportVideo && (
            <div className="text-muted" style={{ fontSize: 12 }}>Output isn’t available for this activity type yet.</div>
          )}
      </div>
      </div>
    </div>
  );
}
