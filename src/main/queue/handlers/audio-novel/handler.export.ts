import { fullChaptersOf, simulateSubStep, WorkspaceStepContext, workSubSteps, type WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';

const DOING = 'rendering the part with its cover, title and narration';

/** How many chapters one exporting part covers — the only thing that decides how many parts a run has. */
export const CHAPTERS_PER_PART = 20;

function fullPartsOf(context: WorkspaceStepContext): number[] {
  const chapters = fullChaptersOf(context).length;
  return Array.from({ length: Math.ceil(chapters / CHAPTERS_PER_PART) }, (_unused, index) => index + 1);
}

/** The parts the run's chapters are grouped into, numbered from 1. */
function submittedPartsOf(context: WorkspaceStepContext): number[] {
  const chapters = context.run.toChapter - context.run.fromChapter + 1;
  return Array.from({ length: Math.ceil(chapters / CHAPTERS_PER_PART) }, (_unused, index) => index + 1);
}

/** Step 05 — renders one video part per group of chapters, rather than one per chapter. */
export const exportHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.Export,
  totalCount: (context) => fullPartsOf(context),
  subStepsOf: (context) => submittedPartsOf(context),
  run: (context) => workSubSteps(context, submittedPartsOf(context), (partNo) => simulateSubStep(WorkspaceStepKey.Export, context.run, partNo, DOING)),
};
