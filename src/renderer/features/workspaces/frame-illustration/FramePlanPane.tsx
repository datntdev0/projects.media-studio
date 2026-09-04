import { useEffect, useState } from 'react';
import { SparkleIcon, StoryboardIcon } from '@/components/icons';
import { formatClock } from '@/shared/app-workspace-narration';
import type { ArtStyle, ChapterFramePlan, IllustrationFrame, WorkspaceChapterFrames, WorkspaceIllustrationChapter } from '@/shared/app-workspace-illustration';
import { frameCountLabelOf, frameImageOf, frameRailTagOf } from '../illustrationFormat';
import { ChapterRail } from '../ChapterRail';
import { PromptCard } from './PromptCard';
import { ImageLightbox, type LightboxSlide } from './ImageLightbox';

interface FramePlanPaneProps {
  workspaceId: string;
  chapters: WorkspaceIllustrationChapter[];
  style: ArtStyle;
  disabled: boolean;
  /** Why frame planning cannot run, or undefined when it can — the workspace has picked no LLM. */
  noLlm: string | undefined;
  /** Re-read the step's own state, since planning and drawing change the chapter counts the rail shows. */
  onChange(): void;
}

const FRAME_WIDTH = 224;
const FRAME_HEIGHT = 126;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The chapter the pane opens on: the first with frames, else the first that could have some. */
function firstOpenableOf(chapters: WorkspaceIllustrationChapter[]): number | undefined {
  return (chapters.find((chapter) => chapter.frameCount > 0) ?? chapters.find((chapter) => chapter.narrated))?.idx;
}

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

/** The chapter's drawn frames in plan order — what the slideshow steps through. */
function slidesOf(frames: IllustrationFrame[], style: ArtStyle, images: Record<string, string>): LightboxSlide[] {
  return frames
    .map((frame) => ({ frame, image: frameImageOf(frame.idx, style, images) }))
    .filter((entry) => entry.image.url !== undefined)
    .map((entry) => ({ file: entry.image.file, url: entry.image.url as string, title: `Frame ${String(entry.frame.idx).padStart(2, '0')} · ${entry.frame.scene}`, note: entry.frame.moment }));
}

/** One chapter's frames: the plan cut against its .srt, each frame's prompt, and what has been drawn. */
function ChapterFramesPane({ workspaceId, chapterNo, style, disabled, noLlm, onChange }: { workspaceId: string; chapterNo: number; style: ArtStyle; disabled: boolean; noLlm: string | undefined; onChange(): void }) {
  const [chapter, setChapter] = useState<WorkspaceChapterFrames | undefined>(undefined);
  const [plan, setPlan] = useState<ChapterFramePlan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState<string | undefined>(undefined);

  useEffect(() => {
    window.appWorkspaceIllustrationApi
      .readChapter(workspaceId, chapterNo)
      .then((next) => {
        setChapter(next);
        setPlan(next.plan);
        setDirty(false);
        setError(undefined);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [workspaceId, chapterNo, style]);

  const editFrame = (frame: IllustrationFrame, prompt: string) => {
    if (!plan) return;
    setPlan({ ...plan, frames: plan.frames.map((candidate) => (candidate.idx === frame.idx ? { ...candidate, prompt } : candidate)) });
    setDirty(true);
  };

  /** Runs one main-process action that answers with the chapter as it now stands, and takes that as the new baseline. */
  const work = async (action: Promise<WorkspaceChapterFrames>) => {
    setBusy(true);
    setError(undefined);
    try {
      const next = await action;
      setChapter(next);
      setPlan(next.plan);
      setDirty(false);
      onChange();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setDrawing(undefined);
    }
  };

  const save = () => (plan ? work(window.appWorkspaceIllustrationApi.saveFrames(workspaceId, chapterNo, plan)) : undefined);
  const replan = () => work(window.appWorkspaceIllustrationApi.planFrames(workspaceId, chapterNo));

  /** A frame is drawn from the prompt on disk, so an unsaved edit is saved first. */
  const draw = (frameIdx: number) => {
    setDrawing(frameIdx);
    return work((async () => {
      if (dirty && plan) await window.appWorkspaceIllustrationApi.saveFrames(workspaceId, chapterNo, plan);
      return window.appWorkspaceIllustrationApi.drawFrame(workspaceId, chapterNo, frameIdx);
    })());
  };

  if (!chapter) return <div className="text-muted" style={{ padding: 20.4, fontSize: 13 }}>{error ?? 'Opening the chapter…'}</div>;

  const frames = plan?.frames ?? [];
  const missing = frames.filter((frame) => frameImageOf(frame.idx, style, chapter.images).url === undefined).length;
  const slides = slidesOf(frames, style, chapter.images);

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '10.2px 20.4px', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Chapter {chapter.idx} · {frames.length} frame(s) · {formatClock(chapter.duration)} of narration
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{chapter.title}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6.8, alignItems: 'center' }}>
          {error && <span className="tag tag-outline" title={error} style={{ fontSize: 10, padding: '1px 6px' }}>Error</span>}
          {dirty && (
            <>
              <span className="tag tag-neutral" style={{ fontSize: 10, padding: '1px 6px' }}>Unsaved</span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} disabled={busy} onClick={() => { setPlan(chapter.plan); setDirty(false); }}>Revert</button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 13 }} disabled={busy} onClick={save}>Save prompts</button>
            </>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 13, gap: 6 }}
            disabled={disabled || busy || noLlm !== undefined || chapter.duration === 0}
            title={noLlm ?? (chapter.duration === 0 ? 'This chapter has no narration yet — frames are cut against its .srt.' : 'Cuts the chapter into frames again, replacing the plan and its prompts.')}
            onClick={replan}
          >
            <StoryboardIcon width={14} height={14} />
            {busy && drawing === undefined ? 'Planning…' : 'Re-plan frames'}
          </button>
          <button type="button" className="btn btn-primary" style={{ fontSize: 13, gap: 6 }} disabled title="Execute the step to draw every missing frame of a chapter range — from here, draw one at a time to check the look first.">
            <SparkleIcon width={14} height={14} />
            Generate missing · {missing}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20.4 }}>
        <div className="blueprint" style={{ padding: '10.2px 13.6px', marginBottom: 17, display: 'flex', alignItems: 'center', gap: 10.2, background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
          <StoryboardIcon width={16} height={16} style={{ flex: 'none', color: 'var(--color-accent-700)' }} />
          <span style={{ fontSize: 13 }}>
            The LLM cuts the chapter into frames along its scenes and <b>.srt</b> cues; each frame prompt is the art style + the characters outfits for that scene + the moment described. Edit a prompt, then regenerate just that frame.
          </span>
        </div>

        {frames.length === 0 ? (
          <div className="text-muted" style={{ fontSize: 13 }}>This chapter has not been cut into frames yet.</div>
        ) : (
          frames.map((frame) => (
            <div key={frame.idx} style={{ display: 'flex', gap: 13.6 }}>
              <div style={{ flex: 'none', width: 64, paddingTop: 13.6 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{String(frame.idx).padStart(2, '0')}</div>
                <div className="text-muted" style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', lineHeight: 1.5 }}>{formatClock(frame.start)}<br />→ {formatClock(frame.end)}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>cues {frame.fromCue}–{frame.toCue}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PromptCard
                  image={frameImageOf(frame.idx, style, chapter.images)}
                  width={FRAME_WIDTH}
                  height={FRAME_HEIGHT}
                  label="Prompt · art style + the scene outfits + the moment — editable"
                  prompt={frame.prompt}
                  onPrompt={(prompt) => editFrame(frame, prompt)}
                  onGenerate={() => draw(frame.idx)}
                  onOpen={() => setShown(frameImageOf(frame.idx, style, chapter.images).file)}
                  disabled={disabled || busy}
                  working={drawing === frame.idx}
                  note={frameImageOf(frame.idx, style, chapter.images).file}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', flex: 'none' }}>{frame.scene}</span>
                      {frame.cast.map((member) => (
                        <span key={member} className="tag tag-accent" style={{ fontSize: 10.5, padding: '1px 6px' }}>{member}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, color: 'color-mix(in srgb, var(--color-text) 80%, transparent)' }}>{frame.moment}</div>
                  </div>
                </PromptCard>
              </div>
            </div>
          ))
        )}

        <div className="text-muted" style={{ fontSize: 12, marginTop: 13.6 }}>
          Frames live in <b>illustrations/frames/chapter-{String(chapter.idx).padStart(4, '0')}/</b> with a <b>frames.json</b> holding their cue range and prompt — Export lays each one over its span of narration.
        </div>
      </div>

      <ImageLightbox slides={slides} file={shown} onFile={setShown} />
    </div>
  );
}

/** The step's frames tab: the chapters down the side, and one chapter's frames beside them. */
export function FramePlanPane({ workspaceId, chapters, style, disabled, noLlm, onChange }: FramePlanPaneProps) {
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const picked = chapters.find((chapter) => chapter.idx === (selected ?? firstOpenableOf(chapters)));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <ChapterRail
        width={300}
        rows={chapters.map((chapter) => ({ idx: chapter.idx, title: chapter.title, sub: frameCountLabelOf(chapter), tag: frameRailTagOf(chapter) }))}
        selected={picked?.idx}
        onPick={setSelected}
        note="Greyed chapters have no narration yet — frames are cut against the .srt timeline, so audio comes first."
      />

      {picked ? (
        <ChapterFramesPane key={picked.idx} workspaceId={workspaceId} chapterNo={picked.idx} style={style} disabled={disabled} noLlm={noLlm} onChange={onChange} />
      ) : (
        <EmptyState kicker="Nothing to cut yet" title="Waiting for narration" note="Frames are cut against a chapter .srt, so a chapter has to be narrated before it can be planned." />
      )}
    </div>
  );
}
