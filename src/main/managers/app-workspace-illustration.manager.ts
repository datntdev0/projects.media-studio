import type { Db } from '@/main/database/client';
import { getAppWorkspace, updateAppWorkspaceArtStyle } from '@/main/database/repositories/app-workspace.repo';
import { listNarratedChapterNos, narrationTitleOf, readChapterCues } from '@/main/queue/handlers/audio-novel/narration-speech';
import { characterImageUrls, designWrittenAt, drawCharacterImage, drawFrameImage, frameCountsOf, frameImageUrls, planChapterFrames, readDesign, readFramePlan, rebuildDesign, requireDesign, writeDesign, writeFramePlan } from '@/main/queue/handlers/audio-novel/frame-illustration';
import { readWorldTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import { resolveLlmSettings } from '@/main/helpers/config';
import { novelChaptersOf } from './app-workspace-extraction.manager';
import { NO_LLM_MESSAGE, type AppWorkspace } from '@/shared/app-workspace';
import type { LlmSettings } from '@/shared/llm';
import { isArtStyle, type ArtStyle, type ChapterFramePlan, type IllustrationDesign, type WorkspaceChapterFrames, type WorkspaceIllustrationChapter, type WorkspaceIllustrationState } from '@/shared/app-workspace-illustration';

export interface AppWorkspaceIllustrationManager {
  read(workspaceId: string): WorkspaceIllustrationState;
  setStyle(workspaceId: string, style: ArtStyle): WorkspaceIllustrationState;
  saveDesign(workspaceId: string, design: IllustrationDesign): WorkspaceIllustrationState;
  rebuildDesign(workspaceId: string): WorkspaceIllustrationState;
  readChapter(workspaceId: string, chapterNo: number): WorkspaceChapterFrames;
  saveFrames(workspaceId: string, chapterNo: number, plan: ChapterFramePlan): WorkspaceChapterFrames;
  planFrames(workspaceId: string, chapterNo: number): Promise<WorkspaceChapterFrames>;
  drawCharacter(workspaceId: string, characterSlug: string, outfitSlug: string): Promise<WorkspaceIllustrationState>;
  drawFrame(workspaceId: string, chapterNo: number, frameIdx: number): Promise<WorkspaceChapterFrames>;
}

/**
 * The Frame Illustration step's output, which lives in the workspace's working
 * directory beside the translations it is derived from — so this manager composes
 * file helpers rather than a repository, and the workspace row only carries the
 * art style. That style scopes the image files, so what `read` reports drawn is
 * what was drawn in the current one.
 */
export function createAppWorkspaceIllustrationManager(db: Db): AppWorkspaceIllustrationManager {
  const need = (workspaceId: string): AppWorkspace => {
    const workspace = getAppWorkspace(db, workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }
    return workspace;
  };

  const chaptersOf = (workspace: AppWorkspace): WorkspaceIllustrationChapter[] => {
    const narrated = new Set(listNarratedChapterNos(workspace));
    return novelChaptersOf(db, workspace.libraryId).map((chapter) => ({
      ...chapter,
      narrated: narrated.has(chapter.idx),
      ...frameCountsOf(workspace.name, chapter.idx, workspace.artStyle),
    }));
  };

  const stateOf = (workspace: AppWorkspace): WorkspaceIllustrationState => ({
    design: readDesign(workspace.name) ?? null,
    hasMetadata: readWorldTranslation(workspace.name) !== undefined,
    style: workspace.artStyle,
    images: characterImageUrls(workspace.name),
    updatedAt: designWrittenAt(workspace.name) ?? null,
    chapters: chaptersOf(workspace),
    llm: resolveLlmSettings(workspace.llm),
  });

  const chapterOf = (workspace: AppWorkspace, chapterNo: number): WorkspaceChapterFrames => {
    const cues = readChapterCues(workspace, chapterNo);
    return {
      idx: chapterNo,
      title: narrationTitleOf(workspace, chapterNo) || novelChaptersOf(db, workspace.libraryId).find((chapter) => chapter.idx === chapterNo)?.title || '',
      plan: readFramePlan(workspace.name, chapterNo) ?? null,
      duration: cues.length === 0 ? 0 : cues[cues.length - 1].end,
      images: frameImageUrls(workspace.name, chapterNo),
    };
  };

  const needLlm = (workspace: AppWorkspace): LlmSettings => {
    const llm = resolveLlmSettings(workspace.llm);
    if (!llm) throw new Error(NO_LLM_MESSAGE);
    return llm;
  };

  return {
    read: (workspaceId) => stateOf(need(workspaceId)),

    setStyle: (workspaceId, style) => {
      if (!isArtStyle(style)) throw new Error(`'${style}' is not an art style the step offers.`);
      return stateOf(updateAppWorkspaceArtStyle(db, need(workspaceId).id, style));
    },

    saveDesign: (workspaceId, design) => {
      const workspace = need(workspaceId);
      writeDesign(workspace.name, design);
      return stateOf(workspace);
    },

    rebuildDesign: (workspaceId) => {
      const workspace = need(workspaceId);
      rebuildDesign(workspace.name, workspace.artStyle);
      return stateOf(workspace);
    },

    readChapter: (workspaceId, chapterNo) => chapterOf(need(workspaceId), chapterNo),

    saveFrames: (workspaceId, chapterNo, plan) => {
      const workspace = need(workspaceId);
      writeFramePlan(workspace.name, chapterNo, plan);
      return chapterOf(workspace, chapterNo);
    },

    planFrames: async (workspaceId, chapterNo) => {
      const workspace = need(workspaceId);
      await planChapterFrames(workspace, chapterNo, requireDesign(workspace.name, workspace.artStyle), needLlm(workspace));
      return chapterOf(workspace, chapterNo);
    },

    drawCharacter: async (workspaceId, characterSlug, outfitSlug) => {
      const workspace = need(workspaceId);
      await drawCharacterImage(workspace, requireDesign(workspace.name, workspace.artStyle), characterSlug, outfitSlug);
      return stateOf(workspace);
    },

    drawFrame: async (workspaceId, chapterNo, frameIdx) => {
      const workspace = need(workspaceId);
      await drawFrameImage(workspace, chapterNo, frameIdx);
      return chapterOf(workspace, chapterNo);
    },
  };
}
