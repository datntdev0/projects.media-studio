import { useState, type ReactNode } from 'react';
import { RefreshIcon } from '@/components/icons';
import { formatDate } from '@/features/library/libraryFormat';
import { NO_LLM_MESSAGE, WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { ART_STYLES, type ArtStyle, type WorkspaceIllustrationState } from '@/shared/app-workspace-illustration';
import { STEP_NAME, stepTagOf } from './workspaceFormat';
import { designCountLabelOf } from './illustrationFormat';
import { useWorkspaceIllustration } from './useWorkspaceIllustration';
import { CharacterDesignPane } from './frame-illustration/CharacterDesignPane';
import { FramePlanPane } from './frame-illustration/FramePlanPane';

interface WorkspaceFrameIllustrationProps {
  workspace: AppWorkspace;
}

/** Which half of the step the screen is showing — the characters it designs once, or the frames of each chapter. */
enum IllustrationTab {
  Characters = 'characters',
  Frames = 'frames',
}

const TAB_LABEL: Record<IllustrationTab, string> = {
  [IllustrationTab.Characters]: 'Character design',
  [IllustrationTab.Frames]: 'Illustration frames',
};

function drawnLabelOf(state: WorkspaceIllustrationState | undefined): string {
  if (!state || state.updatedAt === null) return 'nothing designed yet';
  return `design updated ${formatDate(state.updatedAt)}`;
}

function EmptyState({ kicker, title, note, children }: { kicker: string; title: string; note: string; children?: ReactNode }) {
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 20.4 }}>
      <div className="blueprint" style={{ borderStyle: 'dashed', padding: '34px 44px', textAlign: 'center' }}>
        <div className="card-kicker">{kicker}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17, margin: '4px 0' }}>{title}</div>
        <div className="text-muted" style={{ fontSize: 13, maxWidth: 400, textWrap: 'pretty' }}>{note}</div>
        {children && <div style={{ marginTop: 13.6 }}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * The Frame Illustration step's screen. The characters tab designs every body
 * once and every outfit once from `world.vi.json`, editing the prompts each image
 * is drawn with; the frames tab shows a chapter cut into frames along its .srt.
 * The art style is the workspace's and scopes every image file, so switching it
 * shows what was drawn that way.
 */
export function WorkspaceFrameIllustration({ workspace }: WorkspaceFrameIllustrationProps) {
  const running = workspace.status === WorkspaceStatus.Running;
  const { state, draft, busy, error, dirty, edit, revert, save, rebuild, setStyle, drawCharacter, reload } = useWorkspaceIllustration(workspace.id, running);
  const [tab, setTab] = useState<IllustrationTab>(IllustrationTab.Characters);
  const [drawing, setDrawing] = useState<string | undefined>(undefined);

  const step = stepTagOf(workspace, WorkspaceStepKey.FrameIllustration);
  const style = state?.style ?? workspace.artStyle;
  const images = state?.images ?? {};
  const noLlm = state !== undefined && state.llm === null ? NO_LLM_MESSAGE : undefined;

  /** A card is drawn from the prompt on disk, so an unsaved edit is saved first. */
  const draw = async (characterSlug: string, outfitSlug: string) => {
    setDrawing(`${characterSlug}.${outfitSlug}`);
    if (dirty) await save();
    await drawCharacter(characterSlug, outfitSlug);
    setDrawing(undefined);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, padding: '10.2px 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{STEP_NAME[WorkspaceStepKey.FrameIllustration]}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>Designs each character once, then illustrates the frames of every chapter · {drawnLabelOf(state)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className={`tag ${step.tagClass}`} style={{ fontSize: 10, padding: '1px 6px' }}>{step.tag}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{state ? designCountLabelOf(state.design, style, images) : step.count}</span>
            {dirty && <span className="tag tag-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>Unsaved</span>}
            {noLlm && <span className="tag tag-outline" title={noLlm} style={{ fontSize: 10, padding: '1px 6px' }}>No LLM picked</span>}
            {error && <span className="tag tag-outline" title={error} style={{ fontSize: 10, padding: '1px 6px' }}>Error</span>}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6.8 }} title={running ? 'A run is in flight — the art style cannot be changed under it.' : undefined}>
            {dirty && (
              <>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={revert} disabled={busy}>Revert</button>
                <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} onClick={save} disabled={busy}>Save prompts</button>
              </>
            )}
            <span className="text-muted" style={{ fontSize: 12 }}>Art style</span>
            <select className="input" style={{ width: 240, fontSize: 13 }} value={style} disabled={busy || running || dirty} onChange={(e) => setStyle(e.target.value as ArtStyle)}>
              {ART_STYLES.map((rules) => (
                <option key={rules.key} value={rules.key}>{rules.label}</option>
              ))}
            </select>
          </div>
          <div className="seg">
            {Object.values(IllustrationTab).map((option) => (
              <label key={option} className="seg-opt">
                <input type="radio" name="illustration-tab" style={{ display: 'none' }} checked={tab === option} onChange={() => setTab(option)} />
                <span>{TAB_LABEL[option]}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {!state ? (
        <EmptyState kicker="Reading" title="Opening the design…" note={error ?? 'The design and its images are read from the workspace working directory.'} />
      ) : tab === IllustrationTab.Frames ? (
        <FramePlanPane workspaceId={workspace.id} chapters={state.chapters} style={style} disabled={running} noLlm={noLlm} onChange={reload} />
      ) : draft ? (
        <CharacterDesignPane design={draft} style={style} images={images} disabled={busy || running} drawing={drawing} onEdit={edit} onRebuild={rebuild} onGenerate={draw} />
      ) : (
        <EmptyState
          kicker="Nothing to draw yet"
          title={state.hasMetadata ? 'No character design yet' : 'Waiting for translated metadata'}
          note={error ?? (state.hasMetadata
            ? 'Every body once, every outfit once — build the design from world.vi.json to start drawing.'
            : 'Character looks are built from world.vi.json — every body once, every outfit once, with the scenes that wear it. Frames follow once a chapter has its narration.')}
        >
          {state.hasMetadata && (
            <button type="button" className="btn btn-primary" style={{ gap: 6 }} disabled={busy} onClick={rebuild}>
              <RefreshIcon width={15} height={15} />
              Build from metadata
            </button>
          )}
        </EmptyState>
      )}
    </div>
  );
}
