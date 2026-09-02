import { useMemo, useState } from 'react';
import { PlusIcon } from '@/components/icons';
import { formatDate } from '@/features/library/libraryFormat';
import { NO_LLM_MESSAGE, WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import type { WorkspaceExtractionChapter, WorkspaceWorldState, WorldBible } from '@/shared/app-workspace-extraction';
import { LLM_ENGINE_LABEL, LlmEngine, firstModelOf, type LlmOptions, type LlmSettings } from '@/shared/llm';
import { STEP_NAME, STEP_STATE_LABEL, STEP_STATE_TAG_CLASS, stepCountLabelOf } from './workspaceFormat';
import { useWorkspaceWorld } from './useWorkspaceWorld';
import { WorldSection, WORLD_SECTION_LABEL, emptyCharacter, emptyTerm, emptyTimeline, extractionProgressOf } from './worldFormat';
import { WorldCharacterTable } from './WorldCharacterTable';
import { WorldGlossaryTable } from './WorldGlossaryTable';
import { WorldTimelineTable } from './WorldTimelineTable';

interface WorkspaceSemanticAnalysisProps {
  workspace: AppWorkspace;
}

const ADD_LABEL: Record<WorldSection, string> = {
  [WorldSection.Characters]: 'Add character',
  [WorldSection.Timelines]: 'Add scene',
  [WorldSection.Glossary]: 'Add term',
};

function addTo(world: WorldBible, section: WorldSection): WorldBible {
  if (section === WorldSection.Characters) return { ...world, characters: [...world.characters, emptyCharacter()] };
  if (section === WorldSection.Timelines) return { ...world, timelines: [...world.timelines, emptyTimeline()] };
  return { ...world, glossary: [...world.glossary, emptyTerm()] };
}

interface LlmPickerProps {
  /** Null until this workspace has picked — config.json names models, never an engine. */
  llm: LlmSettings | null;
  options: LlmOptions;
  disabled: boolean;
  onChange(llm: LlmSettings): void;
}

/**
 * Which CLI this workspace's LLM steps call. There is no default: nothing runs
 * until an engine is picked here, and picking one takes that engine's first
 * configured model, since a model belongs to one engine only. The lists come
 * from `llm.models` in config.json, so adding a model is a config change rather
 * than a code one.
 */
function LlmPicker({ llm, options, disabled, onChange }: LlmPickerProps) {
  const models = llm ? options.models[llm.engine] ?? [] : [];
  // A model the config no longer lists is still shown — it is what the chapters already extracted were extracted with.
  const shown = !llm || models.includes(llm.model) ? models : [llm.model, ...models];

  return (
    <>
      <select
        className="input"
        style={{ width: 120, fontSize: 13 }}
        value={llm?.engine ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const engine = e.target.value as LlmEngine;
          onChange({ engine, model: firstModelOf(options, engine) });
        }}
      >
        {!llm && <option value="">Pick engine…</option>}
        {options.engines.map((engine) => (
          <option key={engine} value={engine}>{LLM_ENGINE_LABEL[engine]}</option>
        ))}
      </select>
      <select
        className="input"
        style={{ width: 180, fontSize: 13 }}
        value={llm?.model ?? ''}
        disabled={disabled || !llm}
        onChange={(e) => llm && onChange({ engine: llm.engine, model: e.target.value })}
      >
        {!llm && <option value="">No model</option>}
        {shown.map((model) => (
          <option key={model} value={model}>{model}</option>
        ))}
      </select>
    </>
  );
}

/** What the header says about the step's own progress, read off the workspace row. */
function stepTagOf(workspace: AppWorkspace): { tag: string; tagClass: string; count: string } {
  const step = workspace.steps.find((candidate) => candidate.key === WorkspaceStepKey.SemanticAnalysis);
  if (!step) return { tag: 'Off', tagClass: 'tag-neutral', count: 'Not in this pipeline' };
  return { tag: STEP_STATE_LABEL[step.state], tagClass: STEP_STATE_TAG_CLASS[step.state], count: stepCountLabelOf(step) };
}

function mergedLabelOf(state: WorkspaceWorldState | undefined): string {
  if (!state || state.updatedAt === null) return 'No chapters extracted yet';
  const extracted = state.chapters.filter((chapter) => chapter.extracted).length;
  return `merged from ${extracted} extracted chapter(s) · ${formatDate(state.updatedAt)}`;
}

/** The chapters rail: how much of the novel this step has got through, chapter by chapter. */
function ChaptersRail({ chapters }: { chapters: WorkspaceExtractionChapter[] }) {
  const progress = extractionProgressOf(chapters);

  return (
    <div style={{ width: 360, flex: 'none', borderLeft: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 'none', padding: '10.2px 13.6px', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14 }}>Chapters</span>
          <span className="text-muted" style={{ fontSize: 12 }}>{progress.done} / {progress.total} extracted</span>
        </div>
        <div className="progress-track" style={{ height: 4, marginTop: 7 }}>
          <div className="progress-fill" style={{ height: 4, width: `${progress.pct}%` }} />
        </div>
        <div className="text-muted" style={{ fontSize: 11, marginTop: 5 }}>{progress.breakdown}</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {chapters.length === 0 && <div className="text-muted" style={{ padding: '10px 13.6px', fontSize: 11 }}>This novel has no chapters stored yet.</div>}
        {chapters.map((chapter) => (
          <div
            key={chapter.idx}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 13.6px', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)', opacity: chapter.extracted ? 1 : 0.55 }}
          >
            <span className="text-muted" style={{ fontSize: 12, width: 28, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{chapter.idx}</span>
            <span style={{ fontSize: 12.5, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={chapter.title}>{chapter.title}</span>
            <span className={`tag ${chapter.extracted ? 'tag-accent' : 'tag-neutral'}`} style={{ flex: 'none', fontSize: 10, padding: '1px 6px' }}>{chapter.extracted ? 'Done' : 'Pending'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Semantic Analysis step's screen: the world bible the step merged from its
 * per-chapter extractions, one table per section, with the chapters rail beside
 * it. Editing here writes `extractions/world.json` only — the chapter
 * extractions behind it are the step's own, and rebuilding discards the edits.
 */
export function WorkspaceSemanticAnalysis({ workspace }: WorkspaceSemanticAnalysisProps) {
  // A run extracts into the world bible from the main process, so the screen re-reads it while one is in flight.
  const running = workspace.status === WorkspaceStatus.Running;
  const { state, draft, loading, busy, error, dirty, edit, revert, save, rebuild, setLlm } = useWorkspaceWorld(workspace.id, running);
  const [section, setSection] = useState<WorldSection>(WorldSection.Characters);

  const timelineIdxs = useMemo(() => draft?.timelines.map((timeline) => timeline.idx) ?? [], [draft]);
  const step = stepTagOf(workspace);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, padding: '10.2px 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{STEP_NAME[WorkspaceStepKey.SemanticAnalysis]}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>Extracts characters, timelines and glossary per chapter · {mergedLabelOf(state)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className={`tag ${step.tagClass}`} style={{ fontSize: 10, padding: '1px 6px' }}>{step.tag}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{step.count}</span>
            {state && state.llm === null && <span className="tag tag-outline" style={{ fontSize: 10, padding: '1px 6px' }} title={NO_LLM_MESSAGE}>No LLM picked</span>}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 6 }} title={running ? 'A run is in flight — the LLM cannot be changed under it.' : undefined}>
          {state && <LlmPicker llm={state.llm} options={state.llmOptions} disabled={busy || running} onChange={setLlm} />}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '20.4px 20.4px 20.4px 0' }}>
          {!draft ? (
            <div className="blueprint" style={{ borderStyle: 'dashed', padding: 34, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              <div>
                <div className="card-kicker">{loading ? 'Reading' : 'No metadata yet'}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, margin: '4px 0' }}>
                  {loading ? 'Opening the world bible…' : 'Semantic Analysis has not run'}
                </div>
                <div className="text-muted" style={{ fontSize: 13, maxWidth: 380, textWrap: 'pretty' }}>
                  {error ?? 'Characters, timelines and glossary appear here once the first execution extracts chapter metadata.'}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="blueprint" style={{ padding: '10.2px 13.6px', marginBottom: 17, display: 'flex', alignItems: 'center', gap: 10.2, background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
                <span style={{ fontSize: 13 }}>
                  Edits here are saved to <b>extractions/world.json</b>. Rebuild re-merges every chapter extraction and discards them.
                </span>
                {error && <span className="tag tag-outline" title={error} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
                {dirty && <span className="tag tag-neutral">Unsaved</span>}
                <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={rebuild}>Rebuild</button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={busy || !dirty} onClick={revert}>Revert</button>
                  <button type="button" className="btn btn-primary" style={{ fontSize: 12 }} disabled={busy || !dirty} onClick={save}>Save</button>
                </div>
              </div>

              <div className="seg" style={{ marginBottom: 13.6 }}>
                {Object.values(WorldSection).map((option) => (
                  <label key={option} className="seg-opt">
                    <input type="radio" name="world-section" style={{ display: 'none' }} checked={section === option} onChange={() => setSection(option)} />
                    <span>{WORLD_SECTION_LABEL[option]} · {draft[option].length}</span>
                  </label>
                ))}
              </div>

              {section === WorldSection.Characters && (
                <WorldCharacterTable characters={draft.characters} timelineIdxs={timelineIdxs} onChange={(characters) => edit({ ...draft, characters })} />
              )}
              {section === WorldSection.Timelines && <WorldTimelineTable timelines={draft.timelines} onChange={(timelines) => edit({ ...draft, timelines })} />}
              {section === WorldSection.Glossary && <WorldGlossaryTable glossary={draft.glossary} onChange={(glossary) => edit({ ...draft, glossary })} />}

              <div style={{ display: 'flex', gap: 6.8, marginTop: 13.6 }}>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 13, gap: 6 }} onClick={() => edit(addTo(draft, section))}>
                  <PlusIcon width={14} height={14} />
                  {ADD_LABEL[section]}
                </button>
                <span className="text-muted" style={{ fontSize: 12, alignSelf: 'center' }}>New entries live in the world bible only — a rebuild from the chapter extractions drops them.</span>
              </div>
            </>
          )}
        </div>

        <ChaptersRail chapters={state?.chapters ?? []} />
      </div>
    </div>
  );
}
