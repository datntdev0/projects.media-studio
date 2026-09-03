import fs from 'node:fs';
import { readWorkspaceManifest, workspaceChapterFile } from '@/main/helpers/paths';
import { chapterTextFile, hasChapterText, listTranslatedChapterNos, readChapterTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import type { AppWorkspace } from '@/shared/app-workspace';
import { translates } from './language';

export { chapterAudioFile, chapterAudioUrl, chaptersNarratedAt, hasChapterAudio, listNarratedChapterNos, readChapterCues } from './store';
export { narrationLanguageOf } from './language';

/**
 * The file the step hands `speech.py` for a chapter, as it is on disk: the
 * translation's `.vi.txt` when the workspace translates, the working copy's own
 * chapter otherwise. Every non-blank line of it is one utterance. Undefined means
 * there is nothing to read yet — the translation has not been made, or the
 * chapter was never fetched.
 */
export function narrationSourceOf(workspace: AppWorkspace, chapterNo: number): string | undefined {
  if (!translates(workspace)) return workspaceChapterFile(workspace.name, chapterNo);
  return hasChapterText(workspace.name, chapterNo) ? chapterTextFile(workspace.name, chapterNo) : undefined;
}

/** The source, or the reason there is none — for the handler, which cannot read a chapter without one. */
export function requireNarrationSource(workspace: AppWorkspace, chapterNo: number): string {
  const source = narrationSourceOf(workspace, chapterNo);
  if (source) return source;
  const why = translates(workspace) ? 'has no translation yet — run Semantic Translate over it first' : "has no text in this workspace's working copy";
  throw new Error(`Chapter ${chapterNo} ${why}.`);
}

/** The utterances `speech.py` will read for the chapter — the source's non-blank lines, cut as it cuts them. */
export function readNarrationLines(workspace: AppWorkspace, chapterNo: number): string[] {
  const source = narrationSourceOf(workspace, chapterNo);
  if (!source) return [];
  return fs.readFileSync(source, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line !== '');
}

/** What the chapter is called on the screen — its translated title when there is one, the working copy's otherwise. */
export function narrationTitleOf(workspace: AppWorkspace, chapterNo: number): string {
  const original = readWorkspaceManifest(workspace.name)?.chapters.find((chapter) => chapter.idx === chapterNo)?.title ?? '';
  return (translates(workspace) && readChapterTranslation(workspace.name, chapterNo)?.chapterTitle) || original;
}

/** The chapters that have text to read, without reading any of it. */
export function listReadyChapterNos(workspace: AppWorkspace): number[] {
  if (translates(workspace)) return listTranslatedChapterNos(workspace.name);
  return (readWorkspaceManifest(workspace.name)?.chapters ?? []).filter((chapter) => chapter.file).map((chapter) => chapter.idx);
}

export function isChapterReady(workspace: AppWorkspace, chapterNo: number): boolean {
  return narrationSourceOf(workspace, chapterNo) !== undefined;
}
