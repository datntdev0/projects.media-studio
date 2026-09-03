import { readWorkspaceChapter, readWorkspaceManifest } from '@/main/helpers/paths';
import { hasChapterText, listTranslatedChapterNos, readChapterText, readChapterTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import { WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { narrationLinesOf } from './lines';
import { writeChapterLines } from './store';

export { chapterAudioFile, chapterAudioUrl, chapterLinesFile, chaptersNarratedAt, hasChapterAudio, listNarratedChapterNos, readChapterCues, readChapterLines } from './store';
export { narrationLinesOf } from './lines';

/** What one chapter is read from — the title spoken first, then the body. */
export interface NarrationText {
  title: string;
  body: string;
}

/** Whether the workspace reads the translation — otherwise the novel is read in its own language. */
function translates(workspace: AppWorkspace): boolean {
  return workspace.steps.some((step) => step.key === WorkspaceStepKey.SemanticTranslate);
}

/**
 * The text the step reads for a chapter: its translation when the workspace
 * translates, the working copy's own chapter otherwise. Undefined means there is
 * nothing to read yet — the translation has not been made, or the chapter was
 * never fetched.
 */
export function narrationTextOf(workspace: AppWorkspace, chapterNo: number): NarrationText | undefined {
  const chapter = readWorkspaceChapter(workspace.name, chapterNo);
  if (!translates(workspace)) return chapter && { title: chapter.entry.title, body: chapter.body };

  const body = readChapterText(workspace.name, chapterNo);
  if (body === undefined) return undefined;
  return { title: readChapterTranslation(workspace.name, chapterNo)?.chapterTitle || chapter?.entry.title || '', body };
}

/** The chapters that have text to read, without reading any of it. */
export function listReadyChapterNos(workspace: AppWorkspace): number[] {
  if (translates(workspace)) return listTranslatedChapterNos(workspace.name);
  return (readWorkspaceManifest(workspace.name)?.chapters ?? []).filter((chapter) => chapter.file).map((chapter) => chapter.idx);
}

export function isChapterReady(workspace: AppWorkspace, chapterNo: number): boolean {
  return translates(workspace) ? hasChapterText(workspace.name, chapterNo) : readWorkspaceChapter(workspace.name, chapterNo) !== undefined;
}

/** Writes the lines `speech.py` will read for the chapter, and returns that file. */
export function prepareChapterLines(workspace: AppWorkspace, chapterNo: number): string {
  const text = narrationTextOf(workspace, chapterNo);
  if (!text) {
    const why = translates(workspace) ? 'has no translation yet — run Semantic Translate over it first' : "has no text in this workspace's working copy";
    throw new Error(`Chapter ${chapterNo} ${why}.`);
  }
  return writeChapterLines(workspace.name, chapterNo, narrationLinesOf(text.title, text.body));
}
