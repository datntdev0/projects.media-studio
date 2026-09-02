import { submittedChaptersOf, simulateSubStep, workSubSteps, type WorkspaceStepHandler, fullChaptersOf } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';

const DOING = 'synthesising narration audio and its subtitles';

/** Step 03 — turns each translated chapter into speech. */
export const narrationSpeechHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.NarrationSpeech,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => workSubSteps(context, submittedChaptersOf(context), (chapterNo) => simulateSubStep(WorkspaceStepKey.NarrationSpeech, context.run, chapterNo, DOING)),
};
