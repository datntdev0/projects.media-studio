import { fullChaptersOf, submittedChaptersOf, workSubSteps, type WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { hasChapterText, translateChapter } from './semantic-translate';
import { logger } from '@/main/helpers/logger';
import { resolveLlmSettings } from '@/main/helpers/config';
import { NO_LLM_MESSAGE, WorkspaceStepKey } from '@/shared/app-workspace';
import type { LlmSettings } from '@/shared/llm';

/**
 * Translates one chapter unless it already has a translation — an edited or
 * earlier one counts as done without calling the LLM again. Delete its
 * `chapter-XXXX.vi.txt` to have a run translate it afresh.
 */
async function translateIfMissing(workspaceName: string, chapterNo: number, llm: LlmSettings): Promise<void> {
  if (hasChapterText(workspaceName, chapterNo)) {
    logger.debug(`[translation] chapter ${chapterNo} is already translated — skipped`);
    return;
  }
  await translateChapter(workspaceName, chapterNo, llm);
}

/**
 * Step 02 — asks the picked LLM to translate each analysed chapter's text against
 * that chapter's translated metadata, into `translations/vi/chapter-XXXX.vi.txt`.
 * The metadata comes from the world translation the step's screen edits, brought
 * up to date and distributed on the way if the screen has not done so, so the
 * step runs unattended after analysis. A chapter that was never extracted fails
 * rather than being translated blind, and one already translated is skipped.
 */
export const semanticTranslateHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.SemanticTranslate,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => {
    const llm = resolveLlmSettings(context.ws.llm);
    // Submission refuses a run without one, so reaching here means the pick was dropped under it.
    if (!llm) throw new Error(NO_LLM_MESSAGE);
    return workSubSteps(context, submittedChaptersOf(context), (chapterNo) => translateIfMissing(context.ws.name, chapterNo, llm));
  },
};
