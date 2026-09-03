import fs from 'node:fs';
import path from 'node:path';
import { chapterFileStem, chapterNosOf, latestWrittenAt, listChapterFiles } from '@/main/helpers/chapter-files';
import { getAppWorkspaceNarrationDir, narrationFileUrl } from '@/main/helpers/paths';
import { parseSrt, type SrtCue } from '@/shared/app-workspace-narration';

const LINES_EXT = '.txt';
const AUDIO_EXT = '.wav';
const SRT_EXT = '.srt';

function chapterFile(workspaceName: string, chapterNo: number, ext: string): string {
  return path.join(getAppWorkspaceNarrationDir(workspaceName), `${chapterFileStem(chapterNo)}${ext}`);
}

/** The lines `speech.py` reads for one chapter, e.g. `chapter-0001.txt`. */
export function chapterLinesFile(workspaceName: string, chapterNo: number): string {
  return chapterFile(workspaceName, chapterNo, LINES_EXT);
}

/** One chapter's audio, e.g. `chapter-0001.wav` — its .srt sits beside it under the same stem. */
export function chapterAudioFile(workspaceName: string, chapterNo: number): string {
  return chapterFile(workspaceName, chapterNo, AUDIO_EXT);
}

export function chapterAudioUrl(workspaceName: string, chapterNo: number): string {
  return narrationFileUrl(workspaceName, path.basename(chapterAudioFile(workspaceName, chapterNo)));
}

/** Whether the chapter's audio is already written — checked without reading it. */
export function hasChapterAudio(workspaceName: string, chapterNo: number): boolean {
  return fs.existsSync(chapterAudioFile(workspaceName, chapterNo));
}

/** The chapters that have audio, read from the file names alone. */
export function listNarratedChapterNos(workspaceName: string): number[] {
  return chapterNosOf(listChapterFiles(getAppWorkspaceNarrationDir(workspaceName), AUDIO_EXT));
}

/** When the last chapter's audio was written, or undefined when none has been. */
export function chaptersNarratedAt(workspaceName: string): number | undefined {
  return latestWrittenAt(listChapterFiles(getAppWorkspaceNarrationDir(workspaceName), AUDIO_EXT));
}

/** Writes the chapter's utterances one per line — the file `speech.py` is handed — and returns its path. */
export function writeChapterLines(workspaceName: string, chapterNo: number, lines: string[]): string {
  const file = chapterLinesFile(workspaceName, chapterNo);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

export function readChapterLines(workspaceName: string, chapterNo: number): string[] | undefined {
  const file = chapterLinesFile(workspaceName, chapterNo);
  if (!fs.existsSync(file)) return undefined;
  return fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/** The chapter's cues, or none when it has no .srt yet. */
export function readChapterCues(workspaceName: string, chapterNo: number): SrtCue[] {
  const file = chapterFile(workspaceName, chapterNo, SRT_EXT);
  return fs.existsSync(file) ? parseSrt(fs.readFileSync(file, 'utf8')) : [];
}
