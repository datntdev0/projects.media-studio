// Types and IPC contract for what the Narration Speech step produces. It lives on
// disk under the workspace's own working directory (see helpers/paths.ts):
//
//   appDir/data/workspaces/<slug>/narrations/<lang>/
//   ├── chapter-0001.vi.ngochuyen.080.wav    the chapter spoken, its text's lines back to back
//   └── chapter-0001.vi.ngochuyen.080.srt    one cue per line, timed by that line's own clip
//
// Files are scoped by language, voice and pace (`speechFileTagOf`), so each pick keeps
// its own audio and switching the pick shows what was read that way. The text read is
// the chapter's `.vi.txt` under translations/ when the workspace translates, and the
// working copy's own chapter file otherwise — as it is on disk, every non-blank line one
// utterance. The voice and pace are the workspace's, stored on its row, since every
// chapter of one novel is read the same way.

import { plainSlug } from './text';

/** How a workspace's chapters are read: which VieNeu preset voice, and how fast. */
export interface SpeechSettings {
  voice: string;
  /** 1.0 as synthesized; 1.2 a fifth faster, 0.8 a fifth slower, pitch kept. */
  pace: number;
}

export interface SpeechVoice {
  /** The preset's name, exactly as the model knows it. */
  name: string;
  label: string;
}

/** The preset voices of VieNeu-TTS v3 Turbo, as `speech.py` accepts them for `--voice`. */
export const SPEECH_VOICES: SpeechVoice[] = [
  { name: 'Ngọc Huyền', label: 'female · North · natural' },
  { name: 'Adam', label: 'male · South · natural' },
  { name: 'Minh Đức', label: 'male · North · news' },
  { name: 'Phạm Tuyên', label: 'male · North · natural' },
  { name: 'Thái Sơn', label: 'male · South · storytelling' },
  { name: 'Xuân Vĩnh', label: 'male · South · natural' },
  { name: 'Thanh Bình', label: 'male · North · storytelling' },
  { name: 'Trúc Ly', label: 'female · North · natural' },
  { name: 'Ngọc Linh', label: 'female · North · storytelling' },
  { name: 'Đoan Trang', label: 'female · North · natural' },
  { name: 'Mai Anh', label: 'female · North · news' },
  { name: 'Thục Đoan', label: 'female · South · storytelling' },
  { name: 'Minh Triết', label: 'male · South · news' },
  { name: 'Thùy Dung', label: 'female · South · news' },
  { name: 'Quang Sơn', label: 'male · Central · natural' },
  { name: 'Ngọc Trân', label: 'female · Central · natural' },
  { name: 'Mỹ Duyên', label: 'female · South · reading' },
  { name: 'Quỳnh Anh', label: 'female · North · reading' },
  { name: 'Đức Trí', label: 'male · South · reading' },
  { name: 'Kim Thanh', label: 'female · South · reading' },
];

export const SPEECH_PACES = [0.8, 1.0, 1.2];

export const DEFAULT_SPEECH: SpeechSettings = { voice: SPEECH_VOICES[0].name, pace: 1.0 };

/** Whether `speech` names a voice the model knows and a pace the step offers — checked before it is stored. */
export function isSpeechSettings(speech: SpeechSettings): boolean {
  return SPEECH_VOICES.some((voice) => voice.name === speech.voice) && SPEECH_PACES.includes(speech.pace);
}

export function speechLabelOf(speech: SpeechSettings): string {
  return `${speech.voice} · ${speech.pace.toFixed(1)}×`;
}

/** How a voice and pace name the files read with them — `ngochuyen.080` for Ngọc Huyền at 0.8×. */
export function speechFileTagOf(speech: SpeechSettings): string {
  return `${plainSlug(speech.voice)}.${String(Math.round(speech.pace * 100)).padStart(3, '0')}`;
}

/** One line of an .srt: where it starts and ends in the audio, in seconds. */
export interface SrtCue {
  idx: number;
  start: number;
  end: number;
  text: string;
}

/** `HH:MM:SS,mmm` as seconds. */
function secondsOf(timestamp: string): number {
  const [clock, ms] = timestamp.trim().split(',');
  const [hours, minutes, seconds] = clock.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds + Number(ms) / 1000;
}

/** An .srt as `speech.py` writes it — blocks of an index, a time range and one line of text. */
export function parseSrt(text: string): SrtCue[] {
  const cues: SrtCue[] = [];
  for (const block of text.replace(/\r\n/g, '\n').trim().split(/\n\n+/)) {
    const [idx, range, ...lines] = block.split('\n');
    const [start, end] = (range ?? '').split('-->');
    if (!range || end === undefined) continue;
    cues.push({ idx: Number(idx), start: secondsOf(start), end: secondsOf(end), text: lines.join(' ').trim() });
  }
  return cues;
}

/** The cue the audio is at — the last one that has started, or none before the first. */
export function cueAt(cues: SrtCue[], seconds: number): SrtCue | undefined {
  let current: SrtCue | undefined;
  for (const cue of cues) {
    if (cue.start > seconds) break;
    current = cue;
  }
  return current;
}

/** Seconds as `m:ss`, or `h:mm:ss` once there is an hour. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** One of the novel's chapters and how far narration has got with it. */
export interface WorkspaceNarrationChapter {
  idx: number;
  title: string;
  /** Whether there is text to read — the translation, or the chapter itself when the workspace does not translate. */
  ready: boolean;
  /** Whether its .wav has been written. */
  narrated: boolean;
}

export interface WorkspaceNarrationState {
  chapters: WorkspaceNarrationChapter[];
  speech: SpeechSettings;
  /** When a chapter's audio was last written, epoch ms, or null when none has been. */
  narratedAt: number | null;
}

/** One chapter as the step's screen plays it: the audio, and the cues that follow it. */
export interface WorkspaceChapterNarration {
  idx: number;
  title: string;
  /** Where the renderer streams the .wav from, or null until the chapter is narrated. */
  audioUrl: string | null;
  cues: SrtCue[];
  /** The lines the step would read, when there is text but no audio yet. */
  lines: string[];
}

export const APP_WORKSPACE_NARRATION_IPC_CHANNELS = {
  read: 'app-workspace-narration:read',
  setSpeech: 'app-workspace-narration:set-speech',
  readChapter: 'app-workspace-narration:read-chapter',
} as const;

export interface AppWorkspaceNarrationApi {
  read(workspaceId: string): Promise<WorkspaceNarrationState>;
  /** Stores the workspace's voice and pace — what every later run reads with. */
  setSpeech(workspaceId: string, speech: SpeechSettings): Promise<WorkspaceNarrationState>;
  readChapter(workspaceId: string, chapterNo: number): Promise<WorkspaceChapterNarration>;
}
