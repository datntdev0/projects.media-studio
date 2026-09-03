import type { Db } from '@/main/database/client';
import { getAppWorkspace } from '@/main/database/repositories/app-workspace.repo';
import { llmOptions, resolveLlmSettings } from '@/main/helpers/config';
import { readWorkspaceChapter } from '@/main/helpers/paths';
import { listExtractedChapterNos, readWorldBible } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { chaptersDistributedAt, distributeChapters, listDistributedChapterNos, listTranslatedChapterNos, readChapterText, readChapterTranslation, readWorldTranslation, translateWorldMetadata, worldTranslationWrittenAt, writeChapterText, writeWorldTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import { novelChaptersOf } from './app-workspace-extraction.manager';
import { NO_LLM_MESSAGE, type AppWorkspace } from '@/shared/app-workspace';
import type { WorkspaceChapterTranslation, WorkspaceTranslationChapter, WorkspaceTranslationState, WorldTranslation } from '@/shared/app-workspace-translation';

export interface AppWorkspaceTranslationManager {
  read(workspaceId: string): WorkspaceTranslationState;
  save(workspaceId: string, world: WorldTranslation): WorkspaceTranslationState;
  translateMetadata(workspaceId: string): Promise<WorkspaceTranslationState>;
  distribute(workspaceId: string): WorkspaceTranslationState;
  readChapter(workspaceId: string, chapterNo: number): WorkspaceChapterTranslation;
  saveChapter(workspaceId: string, chapterNo: number, body: string): WorkspaceChapterTranslation;
}

/**
 * The Semantic Translate step's output, which lives in the workspace's working
 * directory beside the extractions it translates — so, like the extraction
 * manager, this one composes file helpers rather than a repository.
 */
export function createAppWorkspaceTranslationManager(db: Db): AppWorkspaceTranslationManager {
  const need = (workspaceId: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  };

  const chaptersOf = (workspace: AppWorkspace): WorkspaceTranslationChapter[] => {
    const extracted = new Set(listExtractedChapterNos(workspace.name));
    const distributed = new Set(listDistributedChapterNos(workspace.name));
    const translated = new Set(listTranslatedChapterNos(workspace.name));
    return novelChaptersOf(db, workspace.libraryId).map((chapter) => ({ ...chapter, extracted: extracted.has(chapter.idx), distributed: distributed.has(chapter.idx), translated: translated.has(chapter.idx) }));
  };

  const stateOf = (workspace: AppWorkspace): WorkspaceTranslationState => ({
    world: readWorldTranslation(workspace.name) ?? null,
    source: readWorldBible(workspace.name) ?? null,
    chapters: chaptersOf(workspace),
    updatedAt: worldTranslationWrittenAt(workspace.name) ?? null,
    distributedAt: chaptersDistributedAt(workspace.name) ?? null,
    llm: resolveLlmSettings(workspace.llm),
    llmOptions: llmOptions(),
  });

  const chapterOf = (workspace: AppWorkspace, chapterNo: number): WorkspaceChapterTranslation => {
    const chapter = readWorkspaceChapter(workspace.name, chapterNo);
    const title = chapter?.entry.title ?? novelChaptersOf(db, workspace.libraryId).find((candidate) => candidate.idx === chapterNo)?.title ?? '';
    return {
      idx: chapterNo,
      title,
      titleTranslated: readChapterTranslation(workspace.name, chapterNo)?.chapterTitle ?? '',
      source: chapter?.body ?? '',
      translated: readChapterText(workspace.name, chapterNo) ?? null,
    };
  };

  return {
    read: (workspaceId) => stateOf(need(workspaceId)),

    save: (workspaceId, world) => {
      const workspace = need(workspaceId);
      writeWorldTranslation(workspace.name, world);
      return stateOf(workspace);
    },

    translateMetadata: async (workspaceId) => {
      const workspace = need(workspaceId);
      const llm = resolveLlmSettings(workspace.llm);
      if (!llm) throw new Error(NO_LLM_MESSAGE);
      await translateWorldMetadata(workspace.name, llm);
      return stateOf(workspace);
    },

    distribute: (workspaceId) => {
      const workspace = need(workspaceId);
      distributeChapters(workspace.name);
      return stateOf(workspace);
    },

    readChapter: (workspaceId, chapterNo) => chapterOf(need(workspaceId), chapterNo),

    saveChapter: (workspaceId, chapterNo, body) => {
      const workspace = need(workspaceId);
      writeChapterText(workspace.name, chapterNo, body);
      return chapterOf(workspace, chapterNo);
    },
  };
}
