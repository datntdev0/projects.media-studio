import { useEffect, useState, type ReactNode } from 'react';
import { CloseIcon, PlayIcon } from '@/components/icons';
import { formatDate } from '@/features/library/libraryFormat';
import { WorkspaceStatus, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { LANGUAGE_NAME, TRANSLATION_LANGUAGE } from '@/shared/app-workspace-translation';
import { SPEECH_PACES, SPEECH_VOICES, speechLabelOf, type SpeechSettings, type WorkspaceChapterNarration, type WorkspaceNarrationChapter, type WorkspaceNarrationState } from '@/shared/app-workspace-narration';
import { STEP_NAME, stepTagOf } from './workspaceFormat';
import { narrationCountLabelOf, narrationRailTagOf } from './narrationFormat';
import { useWorkspaceNarration } from './useWorkspaceNarration';
import { ChapterRail } from './ChapterRail';
import { NarrationPlayer } from './narration-speech/NarrationPlayer';
import { previewOf } from './narration-speech/preview';

interface WorkspaceNarrationSpeechProps {
  workspace: AppWorkspace;
}

const LANGUAGE = LANGUAGE_NAME[TRANSLATION_LANGUAGE];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function narratedLabelOf(state: WorkspaceNarrationState | undefined): string {
  if (!state || state.narratedAt === null) return 'no audio yet';
  return `last audio ${formatDate(state.narratedAt)}`;
}

/** The chapter the screen opens on: the first with audio, else the first that could have some. */
function firstOpenableOf(chapters: WorkspaceNarrationChapter[]): number | undefined {
  return (chapters.find((chapter) => chapter.narrated) ?? chapters.find((chapter) => chapter.ready))?.idx;
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

/** The title block over a player: what is playing, and the voice it is read in. */
function PaneHeading({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '13.6px 20.4px 10.2px' }}>
      <div style={{ minWidth: 0 }}>
        <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{title}</div>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6.8 }}>{children}</div>
    </div>
  );
}

/** The app's introduction read in the picked voice — recorded at 1.0 and played at the picked pace. */
function VoicePreview({ speech, onClose }: { speech: SpeechSettings; onClose(): void }) {
  const preview = previewOf(speech.voice);
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PaneHeading kicker={`Voice preview · ${speechLabelOf(speech)}`} title="Giới thiệu Media Studio">
        <button type="button" className="btn btn-secondary" style={{ fontSize: 12, gap: 5 }} onClick={onClose}>
          <CloseIcon width={13} height={13} />
          Close preview
        </button>
      </PaneHeading>
      {preview ? (
        <NarrationPlayer key={speech.voice} src={preview.url} cues={preview.cues} rate={speech.pace} autoPlay />
      ) : (
        <div className="text-muted" style={{ padding: '0 20.4px', fontSize: 13 }}>No preview has been generated for this voice.</div>
      )}
    </div>
  );
}

/** One chapter: its audio followed through its .srt, or the lines the step would read when there is none yet. */
function ChapterPane({ workspaceId, chapter, speech }: { workspaceId: string; chapter: WorkspaceNarrationChapter; speech: SpeechSettings }) {
  const [narration, setNarration] = useState<WorkspaceChapterNarration | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Re-read when a run writes the chapter's audio under the screen.
  useEffect(() => {
    window.appWorkspaceNarrationApi
      .readChapter(workspaceId, chapter.idx)
      .then((next) => {
        setNarration(next);
        setError(undefined);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [workspaceId, chapter.idx, chapter.narrated]);

  if (!narration) return <div className="text-muted" style={{ padding: 20.4, fontSize: 13 }}>{error ?? 'Opening the chapter…'}</div>;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PaneHeading kicker={`Chapter ${narration.idx} · ${LANGUAGE} · ${speechLabelOf(speech)}`} title={narration.title || chapter.title}>
        {narration.audioUrl && <span className="tag tag-accent" style={{ fontSize: 10, padding: '1px 6px' }}>.wav + .srt</span>}
      </PaneHeading>
      {narration.audioUrl ? (
        <NarrationPlayer key={narration.audioUrl} src={narration.audioUrl} cues={narration.cues} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 20.4px 20.4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 680 }}>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 10 }}>Not narrated yet · {narration.lines.length} line(s) to read, one cue each</div>
            {narration.lines.map((line, at) => (
              <div key={at} style={{ display: 'flex', gap: 13.6, padding: '6px 10px' }}>
                <span className="text-muted" style={{ fontSize: 11.5, flex: 'none', width: 46, fontVariantNumeric: 'tabular-nums', paddingTop: 2 }}>{at + 1}</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, color: 'color-mix(in srgb, var(--color-text) 72%, transparent)' }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The Narration Speech step's screen. The workspace's voice and pace are picked
 * in the header and previewed on the app's own introduction; the chapters rail
 * says which chapters have text to read and which have audio, and the pane plays
 * a chapter's .wav while following its .srt.
 */
export function WorkspaceNarrationSpeech({ workspace }: WorkspaceNarrationSpeechProps) {
  const running = workspace.status === WorkspaceStatus.Running;
  const { state, loading, busy, error, setSpeech } = useWorkspaceNarration(workspace.id, running);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);

  const step = stepTagOf(workspace, WorkspaceStepKey.NarrationSpeech);
  const chapters = state?.chapters ?? [];
  const picked = chapters.find((chapter) => chapter.idx === (selected ?? firstOpenableOf(chapters)));
  const speech = state?.speech ?? workspace.speech;

  const pick = (idx: number) => {
    setSelected(idx);
    setPreviewing(false);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 13.6, padding: '10.2px 0', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 16 }}>{STEP_NAME[WorkspaceStepKey.NarrationSpeech]}</div>
          <div className="text-muted" style={{ fontSize: 12 }}>Generates a .wav and line-level .srt per chapter with text-to-speech · {narratedLabelOf(state)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
            <span className={`tag ${step.tagClass}`} style={{ fontSize: 10, padding: '1px 6px' }}>{step.tag}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{state ? narrationCountLabelOf(state.chapters) : step.count}</span>
            {error && <span className="tag tag-outline" title={error} style={{ fontSize: 10, padding: '1px 6px' }}>Error</span>}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2 }} title={running ? 'A run is in flight — the voice cannot be changed under it.' : undefined}>
          <select className="input" style={{ width: 150, fontSize: 13 }} value={LANGUAGE} disabled>
            <option value={LANGUAGE}>{LANGUAGE} (TTS)</option>
          </select>
          <select className="input" style={{ width: 230, fontSize: 13 }} value={speech.voice} disabled={busy || running} onChange={(e) => setSpeech({ ...speech, voice: e.target.value })}>
            {SPEECH_VOICES.map((voice) => (
              <option key={voice.name} value={voice.name}>{voice.name} — {voice.label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="text-muted" style={{ fontSize: 12 }}>Pace</span>
            <select className="input" style={{ width: 80, fontSize: 13 }} value={speech.pace} disabled={busy || running} onChange={(e) => setSpeech({ ...speech, pace: Number(e.target.value) })}>
              {SPEECH_PACES.map((pace) => (
                <option key={pace} value={pace}>{pace.toFixed(1)}×</option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" style={{ fontSize: 13, gap: 6 }} onClick={() => setPreviewing(true)} disabled={previewing} title="Hear the picked voice read the app's introduction at the picked pace.">
            <PlayIcon width={14} height={14} />
            Preview
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <ChapterRail
          width={300}
          rows={chapters.map((chapter) => ({ idx: chapter.idx, title: chapter.title, tag: narrationRailTagOf(chapter) }))}
          selected={previewing ? undefined : picked?.idx}
          onPick={pick}
          note={`Greyed chapters have no ${LANGUAGE} text to read yet, so speech can not be generated.`}
        />

        {previewing ? (
          <VoicePreview speech={speech} onClose={() => setPreviewing(false)} />
        ) : !state || !picked ? (
          <EmptyState
            kicker={loading ? 'Reading' : 'No audio yet'}
            title={loading ? 'Opening the narration…' : 'Narration has not run'}
            note={error ?? 'Each chapter gets a .wav and a line-level .srt once its translation exists and this step executes.'}
          />
        ) : (
          <ChapterPane workspaceId={workspace.id} chapter={picked} speech={speech} />
        )}
      </div>
    </div>
  );
}
