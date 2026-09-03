import type { Db } from '@/main/database/client';
import { getAppWorkspace, updateAppWorkspaceSpeech } from '@/main/database/repositories/app-workspace.repo';
import { chapterAudioUrl, chaptersNarratedAt, hasChapterAudio, listNarratedChapterNos, listReadyChapterNos, narrationTitleOf, readChapterCues, readNarrationLines } from '@/main/queue/handlers/audio-novel/narration-speech';
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
 * and pace the step reads with. Those scope the files, so what `read` and
 * `readChapter` report is what was read with the current pick.
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
    const narrated = new Set(listNarratedChapterNos(workspace));
    return novelChaptersOf(db, workspace.libraryId).map((chapter) => ({ ...chapter, ready: ready.has(chapter.idx), narrated: narrated.has(chapter.idx) }));
  };

  const stateOf = (workspace: AppWorkspace): WorkspaceNarrationState => ({
    chapters: chaptersOf(workspace),
    speech: workspace.speech,
    narratedAt: chaptersNarratedAt(workspace) ?? null,
  });

  const chapterOf = (workspace: AppWorkspace, chapterNo: number): WorkspaceChapterNarration => {
    const narrated = hasChapterAudio(workspace, chapterNo);
    const title = narrationTitleOf(workspace, chapterNo) || novelChaptersOf(db, workspace.libraryId).find((candidate) => candidate.idx === chapterNo)?.title || '';
    return {
      idx: chapterNo,
      title,
      audioUrl: narrated ? chapterAudioUrl(workspace, chapterNo) : null,
      cues: narrated ? readChapterCues(workspace, chapterNo) : [],
      lines: narrated ? [] : readNarrationLines(workspace, chapterNo),
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
