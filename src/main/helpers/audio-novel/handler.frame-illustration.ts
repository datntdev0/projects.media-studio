import { submittedChaptersOf, simulateSubStep, workSubSteps, type WorkspaceStepHandler, fullChaptersOf } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';

const DOING = 'generating scene illustrations from the chapter metadata';

/** Step 04 — illustrates each chapter's scenes. Not part of a planned pipeline yet. */
export const frameIllustrationHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.FrameIllustration,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => workSubSteps(context, submittedChaptersOf(context), (chapterNo) => simulateSubStep(WorkspaceStepKey.FrameIllustration, context.run, chapterNo, DOING)),
};
