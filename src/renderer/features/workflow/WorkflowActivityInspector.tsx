import { useEffect, useState } from 'react';
import { CheckIcon, CloseIcon, TrashIcon } from '../../components/icons';
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
  type PipelineProgress,
  type TranslateOutput,
  type TranslateOutputChapter,
  type UpdateAppWorkflowActivityInput,
} from '../../../shared/app-workflow-activity';
import { ContentLanguage, type AppLibraryContent } from '../../../shared/app-library-content';
import { LazySection } from './LazySection';
import { TranslateChapterRow } from './TranslateChapterRow';
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
  withLanguage,
  withPace,
  withResolveConflicts,
  withStyle,
  withVoice,
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

export function WorkflowActivityInspector({ workflowId, activity, activities, contents, maxChapters, onUpdate, onRemove, onClose }: WorkflowActivityInspectorProps) {
  const [tab, setTab] = useState<'general' | 'input' | 'output'>('general');
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [retry, setRetry] = useState(activity.retry);
  const [delay, setDelay] = useState(activity.delay);
  const [analyzeOutput, setAnalyzeOutput] = useState<AnalyzeOutput | null | undefined>(undefined);
  const [translateOutput, setTranslateOutput] = useState<TranslateOutput | null | undefined>(undefined);
  const [progress, setProgress] = useState<PipelineProgress | null | undefined>(undefined);

  useEffect(() => {
    setTab('general');
    setName(activity.name);
    setDescription(activity.description);
    setRetry(activity.retry);
    setDelay(activity.delay);
    setAnalyzeOutput(undefined);
    setTranslateOutput(undefined);
    setProgress(undefined);
  }, [activity.id]);

  useEffect(() => {
    const isPipeline = activity.type === AppWorkflowActivityType.Analyze || activity.type === AppWorkflowActivityType.Translate;
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
      } else {
        window.appWorkflowActivityApi.getTranslateOutput(workflowId, activity.id).then((result) => {
          if (!cancelled) setTranslateOutput(result);
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

  const patchChapters = (patch: Partial<ChapterSelection>) => onUpdate(activity.id, { config: withChapters(activity, { ...chapters!, ...patch }) });

  const handleRemove = () => {
    if (!window.confirm(`Remove "${activity.name}" from this workflow?`)) return;
    onRemove(activity.id);
  };

  return (
    <div style={{ width: 420, flex: 'none', paddingLeft: '10.2px', borderLeft: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-bg)' }}>
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

            <div style={{ display: 'flex', gap: 13.6, marginBottom: 13.6 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="activity-retry">Retry times</label>
                <input
                  className="input"
                  id="activity-retry"
                  type="number"
                  min={0}
                  value={retry}
                  onChange={(e) => setRetry(Number(e.target.value))}
                  onBlur={() => retry !== activity.retry && onUpdate(activity.id, { retry })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="activity-delay">Retry delay</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <input
                    className="input"
                    id="activity-delay"
                    type="number"
                    min={0}
                    value={delay}
                    onChange={(e) => setDelay(Number(e.target.value))}
                    onBlur={() => delay !== activity.delay && onUpdate(activity.id, { delay })}
                    style={{ flex: 1 }}
                  />
                  <span className="text-muted" style={{ fontSize: 12 }}>sec</span>
                </div>
              </div>
            </div>
            <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 20.4 }}>
              A failed attempt waits {delay}s, then retries up to {retry} times before the activity is marked failed and the run stops.
            </div>

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
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={activity.analyzeConfig!.resolveConflicts}
                    onChange={(e) => onUpdate(activity.id, { config: withResolveConflicts(activity, e.target.checked) })}
                    style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 13 }}>Resolve conflicts</span>
                </label>
                <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 13.6 }}>
                  Finds and fixes inconsistent characters, glossary terms, and timeline entries in the merged world bible with an extra model call.
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
              <div style={{ display: 'flex', gap: 13.6, marginBottom: 13.6 }}>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="activity-voice">Voice</label>
                  <select className="input" id="activity-voice" value={activity.ttsConfig!.voice} onChange={(e) => onUpdate(activity.id, { config: withVoice(activity, e.target.value) })}>
                    {VOICES.map((voice) => (
                      <option key={voice} value={voice}>{voice}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ width: 96 }}>
                  <label htmlFor="activity-pace">Pace</label>
                  <select className="input" id="activity-pace" value={activity.ttsConfig!.pace} onChange={(e) => onUpdate(activity.id, { config: withPace(activity, e.target.value) })}>
                    {PACES.map((pace) => (
                      <option key={pace} value={pace}>{pace}</option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="activity-tts-lang">Language</label>
                  <select className="input" id="activity-tts-lang" value={activity.ttsConfig!.language} onChange={(e) => onUpdate(activity.id, { config: withLanguage(activity, e.target.value as ContentLanguage) })}>
                    {Object.entries(LANGUAGE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
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
                    { label: 'Conflicts resolved', value: analyzeOutput.conflictsResolved },
                  ].map((stat) => (
                    <div key={stat.label} className="blueprint" style={{ padding: '9px 11px' }}>
                      <div className="text-muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{stat.label}</div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                <div className="card-kicker">Story summary</div>
                <p style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 16px' }}>{analyzeOutput.summary || 'No summary yet.'}</p>

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

        {tab === 'output' && activity.type !== AppWorkflowActivityType.Analyze && activity.type !== AppWorkflowActivityType.Translate && (
          <div className="text-muted" style={{ fontSize: 12 }}>Output isn’t available for this activity type yet.</div>
        )}
      </div>
      </div>
    </div>
  );
}
