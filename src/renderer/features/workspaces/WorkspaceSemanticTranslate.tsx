import { useState } from 'react';
import { TranslateIcon } from '@/components/icons';
import { formatDate } from '@/features/library/libraryFormat';
import { NO_LLM_MESSAGE, WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { LANGUAGE_NAME, TRANSLATION_LANGUAGE, type WorkspaceTranslationState } from '@/shared/app-workspace-translation';
import { STEP_NAME, stepTagOf } from './workspaceFormat';
import { LlmPicker } from './LlmPicker';
import { useWorkspaceTranslation } from './useWorkspaceTranslation';
import { translationCountLabelOf } from './translationFormat';
import { WorldSection, WORLD_SECTION_LABEL } from './worldFormat';
import { CharacterTable } from './semantic-translate/CharacterTable';
import { TimelineTable } from './semantic-translate/TimelineTable';
import { GlossaryTable } from './semantic-translate/GlossaryTable';
import { TranslationChapterPane } from './TranslationChapterPane';

interface WorkspaceSemanticTranslateProps {
  workspace: AppWorkspace;
}

/** Which half of the step the screen is showing — the translated world bible, or the chapter texts. */
enum TranslateTab {
  Metadata = 'metadata',
  Chapters = 'chapters',
}

const LANGUAGE = LANGUAGE_NAME[TRANSLATION_LANGUAGE];

function distributedLabelOf(state: WorkspaceTranslationState): string {
  const distributed = state.chapters.filter((chapter) => chapter.distributed).length;
  if (state.distributedAt === null) return 'Not distributed yet — the chapters take their metadata from here when they are translated.';
  return `Last distributed ${formatDate(state.distributedAt)} · ${distributed} chapter(s). Distributing again rewrites every chapter's metadata from what is saved here.`;
}

function translatedLabelOf(state: WorkspaceTranslationState | undefined): string {
  if (!state || state.updatedAt === null) return 'metadata not translated yet';
  return `metadata translated · ${formatDate(state.updatedAt)}`;
}

/** The dashed placeholder the step shows before it has anything to work with. */
function EmptyState({ kicker, title, note }: { kicker: string; title: string; note: string }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 20.4 }}>
      <div className="blueprint" style={{ borderStyle: 'dashed', padding: '34px 44px', textAlign: 'center' }}>
        <div className="card-kicker">{kicker}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, margin: '4px 0' }}>{title}</div>
        <div className="text-muted" style={{ fontSize: 13, maxWidth: 380, textWrap: 'pretty' }}>{note}</div>
      </div>
    </div>
  );
}

/**
 * The Semantic Translate step's screen. The metadata tab shows and edits
 * `translations/vi/world.vi.json` beside the world bible it translates; the
 * chapters tab shows each chapter's text beside its translation. Translating the
 * metadata asks the LLM only for what the world bible has that the translation
 * lacks, so edits survive; distributing rewrites every chapter's metadata file
 * from what is saved here.
 */
export function WorkspaceSemanticTranslate({ workspace }: WorkspaceSemanticTranslateProps) {
  const running = workspace.status === WorkspaceStatus.Running;
  const { state, draft, loading, busy, error, dirty, edit, revert, save, translateMetadata, distribute, setLlm } = useWorkspaceTranslation(workspace.id, running);
  const [tab, setTab] = useState<TranslateTab>(TranslateTab.Metadata);
  const [section, setSection] = useState<WorldSection>(WorldSection.Characters);

  const step = stepTagOf(workspace, WorkspaceStepKey.SemanticTranslate);
  const source = state?.source ?? null;
  const noLlm = state !== undefined && state.llm === null;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, padding: '10.2px 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{STEP_NAME[WorkspaceStepKey.SemanticTranslate]}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>Translates metadata, then chapter content · into {LANGUAGE} · {translatedLabelOf(state)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className={`tag ${step.tagClass}`} style={{ fontSize: 10, padding: '1px 6px' }}>{step.tag}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{state ? translationCountLabelOf(state.chapters) : step.count}</span>
            {noLlm && <span className="tag tag-outline" style={{ fontSize: 10, padding: '1px 6px' }} title={NO_LLM_MESSAGE}>No LLM picked</span>}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={running ? 'A run is in flight — the LLM cannot be changed under it.' : undefined}>
            {state && <LlmPicker llm={state.llm} options={state.llmOptions} disabled={busy || running} onChange={setLlm} />}
          </div>
          <div className="seg">
            {Object.values(TranslateTab).map((option) => (
              <label key={option} className="seg-opt">
                <input type="radio" name="translate-tab" style={{ display: 'none' }} checked={tab === option} onChange={() => setTab(option)} />
                <span>{option === TranslateTab.Metadata ? 'Translated metadata' : 'Chapter content'}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {!state || !source ? (
        <EmptyState
          kicker={loading ? 'Reading' : 'Nothing to translate yet'}
          title={loading ? 'Opening the translation…' : 'Waiting for Semantic Analysis'}
          note={error ?? 'Metadata is translated first, then distributed, then chapter content — once analysis has extracted the chapters.'}
        />
      ) : tab === TranslateTab.Chapters ? (
        <TranslationChapterPane workspaceId={workspace.id} chapters={state.chapters} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20.4px 0' }}>
          <div className="blueprint" style={{ padding: '10.2px 13.6px', marginBottom: 17, display: 'flex', alignItems: 'center', gap: 10.2, background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
            <TranslateIcon width={16} height={16} style={{ flex: 'none', color: 'var(--color-accent-700)' }} />
            <span style={{ fontSize: 13 }}>
              Machine-translated from the world bible into <b>translations/{TRANSLATION_LANGUAGE}/world.{TRANSLATION_LANGUAGE}.json</b>. Review and edit here, then <b>distribute to the chapters</b> before translating content.
            </span>
            {error && <span className="tag tag-outline" title={error} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{error}</span>}
            {dirty && <span className="tag tag-neutral">Unsaved</span>}
            <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', gap: 6 }}>
              <button type="button" className="btn btn-primary" style={{ fontSize: 12, gap: 6 }} disabled={busy || running || noLlm || dirty} title={noLlm ? NO_LLM_MESSAGE : dirty ? 'Save or revert your edits first.' : 'Translates what the world bible has that is not translated yet — edits are kept.'} onClick={translateMetadata}>
                <TranslateIcon width={14} height={14} />
                {busy ? 'Working…' : 'Translate metadata'}
              </button>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} disabled={busy || running || !draft || dirty} title={dirty ? 'Save or revert your edits first.' : undefined} onClick={distribute}>Distribute to chapters</button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={busy || !dirty} onClick={revert}>Revert</button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 12 }} disabled={busy || !dirty} onClick={save}>Save</button>
            </div>
          </div>

          {!draft ? (
            <EmptyState kicker="Not translated yet" title="Translate the metadata" note="Translate metadata asks the picked LLM for the world bible's characters, timelines and glossary, one section at a time." />
          ) : (
            <>
              <div className="seg" style={{ marginBottom: 13.6 }}>
                {Object.values(WorldSection).map((option) => (
                  <label key={option} className="seg-opt">
                    <input type="radio" name="translation-section" style={{ display: 'none' }} checked={section === option} onChange={() => setSection(option)} />
                    <span>{WORLD_SECTION_LABEL[option]} · {draft[option].length} / {source[option].length}</span>
                  </label>
                ))}
              </div>

              {section === WorldSection.Characters && <CharacterTable characters={draft.characters} source={source.characters} onChange={(characters) => edit({ ...draft, characters })} />}
              {section === WorldSection.Timelines && <TimelineTable timelines={draft.timelines} source={source.timelines} onChange={(timelines) => edit({ ...draft, timelines })} />}
              {section === WorldSection.Glossary && <GlossaryTable glossary={draft.glossary} source={source.glossary} onChange={(glossary) => edit({ ...draft, glossary })} />}

              <div className="text-muted" style={{ fontSize: 12, marginTop: 13.6 }}>{distributedLabelOf(state)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
