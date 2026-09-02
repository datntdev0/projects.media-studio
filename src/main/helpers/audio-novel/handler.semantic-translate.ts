import { fullChaptersOf, simulateSubStep, submittedChaptersOf, workSubSteps, type WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';

const DOING = 'translating the chapter against the global metadata';

/** Step 02 — translates each analysed chapter into the workspace's target language. */
export const semanticTranslateHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.SemanticTranslate,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => workSubSteps(context, submittedChaptersOf(context), (chapterNo) => simulateSubStep(WorkspaceStepKey.SemanticTranslate, context.run, chapterNo, DOING)),
};
