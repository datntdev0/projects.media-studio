import { fullChaptersOf, submittedChaptersOf, workSubSteps, type WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { extractChapter, hasChapterExtraction, rebuildWorldBible } from './semantic-analysis';
import { logger } from '@/main/helpers/logger';
import { resolveLlmSettings } from '@/main/helpers/config';
import { NO_LLM_MESSAGE, WorkspaceStepKey } from '@/shared/app-workspace';
import type { LlmSettings } from '@/shared/llm';

/**
 * Extracts one chapter and re-merges the world bible, so it is never behind what
 * has been extracted. A chapter that already has an extraction is left alone —
 * it counts as done without calling the LLM again, and the merged bible already
 * covers it. Delete its `chapter-XXXX.json` to have a run extract it afresh.
 */
async function extractAndMerge(workspaceName: string, chapterNo: number, llm: LlmSettings): Promise<void> {
  if (hasChapterExtraction(workspaceName, chapterNo)) {
    logger.debug(`[extraction] chapter ${chapterNo} is already extracted — skipped`);
    return;
  }

  await extractChapter(workspaceName, chapterNo, llm);
  rebuildWorldBible(workspaceName);
}

/**
 * Step 01 — asks the picked LLM to pull each chapter's characters, timelines and
 * glossary out into `extractions/chapter-XXXX.json`, and merges every chapter
 * extracted so far into `extractions/world.json` in code as it goes. Merging
 * after each chapter rather than once at the end costs nothing next to the call
 * itself, and means the step's screen fills in while the run is still going —
 * and that a run that stops early still leaves a current world bible behind.
 * Chapters already extracted are skipped, so a run over a range that overlaps an
 * earlier one only pays for what is missing.
 */
export const semanticAnalysisHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.SemanticAnalysis,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => {
    const llm = resolveLlmSettings(context.ws.llm);
    // Submission refuses a run without one, so reaching here means the pick was dropped under it.
    if (!llm) throw new Error(NO_LLM_MESSAGE);
    return workSubSteps(context, submittedChaptersOf(context), (chapterNo) => extractAndMerge(context.ws.name, chapterNo, llm));
  },
};
