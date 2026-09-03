import fs from 'node:fs';
import path from 'node:path';
import { chapterFileStem, chapterNosOf, latestWrittenAt, listChapterFiles } from '@/main/helpers/chapter-files';
import { getAppWorkspaceNarrationDir, narrationFileUrl } from '@/main/helpers/paths';
import type { AppWorkspace } from '@/shared/app-workspace';
import { parseSrt, speechFileTagOf, type SrtCue } from '@/shared/app-workspace-narration';
import { narrationLanguageOf } from './language';

const AUDIO_EXT = '.wav';
const SRT_EXT = '.srt';

/** Where the workspace's narrations in its language go — `narrations/<lang>/`. */
function narrationDir(workspace: AppWorkspace): string {
  return path.join(getAppWorkspaceNarrationDir(workspace.name), narrationLanguageOf(workspace));
}

/**
 * What a file read with the workspace's voice and pace ends in —
 * `.vi.ngochuyen.080.wav` — so every voice and pace keeps its own files, and
 * changing the pick finds the ones read that way.
 */
function fileSuffix(workspace: AppWorkspace, ext: string): string {
  return `.${narrationLanguageOf(workspace)}.${speechFileTagOf(workspace.speech)}${ext}`;
}

function chapterFile(workspace: AppWorkspace, chapterNo: number, ext: string): string {
  return path.join(narrationDir(workspace), `${chapterFileStem(chapterNo)}${fileSuffix(workspace, ext)}`);
}

/** The chapters read with the workspace's voice and pace, from the file names alone. */
function audioFiles(workspace: AppWorkspace): string[] {
  return listChapterFiles(narrationDir(workspace), fileSuffix(workspace, AUDIO_EXT));
}

/** One chapter's audio, e.g. `chapter-0001.vi.ngochuyen.100.wav` — its .srt sits beside it under the same stem. */
export function chapterAudioFile(workspace: AppWorkspace, chapterNo: number): string {
  return chapterFile(workspace, chapterNo, AUDIO_EXT);
}

export function chapterAudioUrl(workspace: AppWorkspace, chapterNo: number): string {
  return narrationFileUrl(workspace.name, narrationLanguageOf(workspace), path.basename(chapterAudioFile(workspace, chapterNo)));
}

/** Whether the chapter's audio is already written — checked without reading it. */
export function hasChapterAudio(workspace: AppWorkspace, chapterNo: number): boolean {
  return fs.existsSync(chapterAudioFile(workspace, chapterNo));
}

export function listNarratedChapterNos(workspace: AppWorkspace): number[] {
  return chapterNosOf(audioFiles(workspace));
}

/** When the last chapter's audio was written, or undefined when none has been. */
export function chaptersNarratedAt(workspace: AppWorkspace): number | undefined {
  return latestWrittenAt(audioFiles(workspace));
}

/** The chapter's cues, or none when it has no .srt yet. */
export function readChapterCues(workspace: AppWorkspace, chapterNo: number): SrtCue[] {
  const file = chapterFile(workspace, chapterNo, SRT_EXT);
  return fs.existsSync(file) ? parseSrt(fs.readFileSync(file, 'utf8')) : [];
}
