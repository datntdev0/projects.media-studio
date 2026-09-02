import { submittedChaptersOf, simulateSubStep, workSubSteps, type WorkspaceStepHandler, fullChaptersOf } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';

const DOING = 'extracting characters, timelines and glossary';

/** Step 01 — reads each chapter of the range and pulls its metadata out for the global set. */
export const semanticAnalysisHandler: WorkspaceStepHandler = {
  key: WorkspaceStepKey.SemanticAnalysis,
  totalCount: (context) => fullChaptersOf(context),
  subStepsOf: (context) => submittedChaptersOf(context),
  run: (context) => workSubSteps(context, submittedChaptersOf(context), (chapterNo) => simulateSubStep(WorkspaceStepKey.SemanticAnalysis, context.run, chapterNo, DOING)),
};
