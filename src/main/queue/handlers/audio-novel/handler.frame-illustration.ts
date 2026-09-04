import { fullChaptersOf, submittedChaptersOf, workSubSteps, type WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { logger } from '@/main/helpers/logger';
import { resolveLlmSettings } from '@/main/helpers/config';
import { NO_LLM_MESSAGE, WorkspaceStepKey, type AppWorkspace } from '@/shared/app-workspace';
import { frameImageFile } from '@/shared/app-workspace-illustration';
import type { LlmSettings } from '@/shared/llm';
import { drawFrameImage, drawMissingReferences, hasFrameImage, planChapterFrames, readFramePlan, requireDesign } from './frame-illustration';

/**
 * Illustrates one chapter: cuts it into frames if it has none, then draws every
 * frame that is missing, designing the characters it needs on the way. A chapter
 * whose frames are all drawn costs nothing, so a run over an overlapping range
 * only pays for what is new — delete a frame's .png to have it drawn afresh, and
 * its `frames.json` to have the chapter cut again.
 */
async function illustrateChapter(workspace: AppWorkspace, chapterNo: number, llm: LlmSettings): Promise<void> {
  const design = requireDesign(workspace.name, workspace.artStyle);
  const plan = readFramePlan(workspace.name, chapterNo) ?? (await planChapterFrames(workspace, chapterNo, design, llm));

  for (const frame of plan.frames) {
    if (hasFrameImage(workspace.name, chapterNo, frameImageFile(frame.idx, workspace.artStyle))) {
      logger.debug(`[illustration] chapter ${chapterNo} frame ${frame.idx} is already drawn — skipped`);
      continue;
    }
    await drawMissingReferences(workspace, design, frame.refs);
    await drawFrameImage(workspace, chapterNo, frame.idx);
  }
}

/**
 * Step 04 — cuts each narrated chapter into frames with the picked LLM and draws
 * them with the codex CLI's own image tool. The characters are designed once from
 * the translated metadata: the first frame that needs a look draws it, and every
 * later frame is drawn against that image, so a face stays the same face across
 * the novel. A chapter with no narration fails rather than being cut blind — its
 * frames are timed against the .srt.
 */
export const frameIllustrationHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.FrameIllustration,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => {
    const llm = resolveLlmSettings(context.ws.llm);
    // Submission refuses a run without one, so reaching here means the pick was dropped under it.
    if (!llm) throw new Error(NO_LLM_MESSAGE);
    return workSubSteps(context, submittedChaptersOf(context), (chapterNo) => illustrateChapter(context.ws, chapterNo, llm));
  },
};
