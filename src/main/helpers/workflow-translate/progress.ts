import { createPipelineProgress, type PipelineProgressTracker } from '../pipeline-progress';

const STEP_DEFS = [
  { key: 'glossary', label: 'Translating world glossary' },
  { key: 'chapters', label: 'Translating chapter text' },
];

export type TranslateProgressTracker = PipelineProgressTracker;

/** Tracks a translate run's step-by-step progress, persisting it for the Output tab to poll and logging every transition. */
export function createTranslateProgress(workflowId: string, activityId: string): TranslateProgressTracker {
  return createPipelineProgress('workflow-translate', workflowId, activityId, STEP_DEFS);
}
