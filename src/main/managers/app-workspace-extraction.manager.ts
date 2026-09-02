import type { Db } from '@/main/database/client';
import { getAppWorkspace, updateAppWorkspaceLlm } from '@/main/database/repositories/app-workspace.repo';
import { listAppLibraryContents } from '@/main/database/repositories/app-library-content.repo';
import { llmOptions, resolveLlmSettings } from '@/main/helpers/config';
import { listExtractedChapterNos, readWorldBible, rebuildWorldBible, worldBibleWrittenAt, writeWorldBible } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { AppLibraryContentType } from '@/shared/app-library-content';
import type { AppWorkspace } from '@/shared/app-workspace';
import type { WorkspaceExtractionChapter, WorkspaceWorldState, WorldBible } from '@/shared/app-workspace-extraction';
import type { LlmSettings } from '@/shared/llm';

export interface AppWorkspaceExtractionManager {
  read(workspaceId: string): WorkspaceWorldState;
  save(workspaceId: string, world: WorldBible): WorkspaceWorldState;
  rebuild(workspaceId: string): WorkspaceWorldState;
  setLlm(workspaceId: string, llm: LlmSettings): WorkspaceWorldState;
}

/**
 * The Semantic Analysis step's output, which lives in the workspace's working
 * directory rather than the database — so this manager composes the extraction
 * helpers instead of a repository, and the workspace row only tells it which
 * directory to look in and which novel the chapters come from.
 */
export function createAppWorkspaceExtractionManager(db: Db): AppWorkspaceExtractionManager {
  const need = (workspaceId: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  };

  /** The novel's chapters paired with whether this workspace has an extraction for each. */
  const chaptersOf = (workspace: AppWorkspace): WorkspaceExtractionChapter[] => {
    const extracted = new Set(listExtractedChapterNos(workspace.name));
    return listAppLibraryContents(db, workspace.libraryId, { type: AppLibraryContentType.Original })
      .map((content) => ({ idx: content.idx, title: content.textContent?.title ?? '', extracted: extracted.has(content.idx) }))
      .sort((left, right) => left.idx - right.idx);
  };

  const stateOf = (workspace: AppWorkspace): WorkspaceWorldState => ({
    world: readWorldBible(workspace.name) ?? null,
    chapters: chaptersOf(workspace),
    updatedAt: worldBibleWrittenAt(workspace.name) ?? null,
    llm: resolveLlmSettings(workspace.llm),
    llmOptions: llmOptions(),
  });

  return {
    read: (workspaceId) => stateOf(need(workspaceId)),

    save: (workspaceId, world) => {
      const workspace = need(workspaceId);
      writeWorldBible(workspace.name, world);
      return stateOf(workspace);
    },

    rebuild: (workspaceId) => {
      const workspace = need(workspaceId);
      rebuildWorldBible(workspace.name);
      return stateOf(workspace);
    },

    setLlm: (workspaceId, llm) => stateOf(updateAppWorkspaceLlm(db, need(workspaceId).id, llm)),
  };
}
