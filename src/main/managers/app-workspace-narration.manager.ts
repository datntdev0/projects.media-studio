import type { Db } from '@/main/database/client';
import { getAppWorkspace, updateAppWorkspaceSpeech } from '@/main/database/repositories/app-workspace.repo';
import { chapterAudioUrl, chaptersNarratedAt, hasChapterAudio, listNarratedChapterNos, listReadyChapterNos, narrationLinesOf, narrationTextOf, readChapterCues, readChapterLines } from '@/main/queue/handlers/audio-novel/narration-speech';
import { novelChaptersOf } from './app-workspace-extraction.manager';
import type { AppWorkspace } from '@/shared/app-workspace';
import { isSpeechSettings, type SpeechSettings, type WorkspaceChapterNarration, type WorkspaceNarrationChapter, type WorkspaceNarrationState } from '@/shared/app-workspace-narration';

export interface AppWorkspaceNarrationManager {
  read(workspaceId: string): WorkspaceNarrationState;
  setSpeech(workspaceId: string, speech: SpeechSettings): WorkspaceNarrationState;
  readChapter(workspaceId: string, chapterNo: number): WorkspaceChapterNarration;
}

/**
 * The Narration Speech step's output, which lives in the workspace's working
 * directory beside the translations it reads — so this manager composes file
 * helpers rather than a repository, and the workspace row only carries the voice
 * and pace the step reads with.
 */
export function createAppWorkspaceNarrationManager(db: Db): AppWorkspaceNarrationManager {
  const need = (workspaceId: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  };

  const chaptersOf = (workspace: AppWorkspace): WorkspaceNarrationChapter[] => {
    const ready = new Set(listReadyChapterNos(workspace));
    const narrated = new Set(listNarratedChapterNos(workspace.name));
    return novelChaptersOf(db, workspace.libraryId).map((chapter) => ({ ...chapter, ready: ready.has(chapter.idx), narrated: narrated.has(chapter.idx) }));
  };

  const stateOf = (workspace: AppWorkspace): WorkspaceNarrationState => ({
    chapters: chaptersOf(workspace),
    speech: workspace.speech,
    narratedAt: chaptersNarratedAt(workspace.name) ?? null,
  });

  /** The lines as the step wrote them, or as it would cut them from the text there is. */
  const linesOf = (workspace: AppWorkspace, chapterNo: number): string[] => {
    const written = readChapterLines(workspace.name, chapterNo);
    if (written) return written;
    const text = narrationTextOf(workspace, chapterNo);
    return text ? narrationLinesOf(text.title, text.body) : [];
  };

  const chapterOf = (workspace: AppWorkspace, chapterNo: number): WorkspaceChapterNarration => {
    const narrated = hasChapterAudio(workspace.name, chapterNo);
    const title = narrationTextOf(workspace, chapterNo)?.title || novelChaptersOf(db, workspace.libraryId).find((candidate) => candidate.idx === chapterNo)?.title || '';
    return {
      idx: chapterNo,
      title,
      audioUrl: narrated ? chapterAudioUrl(workspace.name, chapterNo) : null,
      cues: narrated ? readChapterCues(workspace.name, chapterNo) : [],
      lines: narrated ? [] : linesOf(workspace, chapterNo),
    };
  };

  return {
    read: (workspaceId) => stateOf(need(workspaceId)),

    setSpeech: (workspaceId, speech) => {
      if (!isSpeechSettings(speech)) throw new Error(`'${speech.voice}' at ${speech.pace}× is not a voice and pace the step offers.`);
      return stateOf(updateAppWorkspaceSpeech(db, need(workspaceId).id, speech));
    },

    readChapter: (workspaceId, chapterNo) => chapterOf(need(workspaceId), chapterNo),
  };
}
