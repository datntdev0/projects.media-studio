import { createPipelineProgress, type PipelineProgressTracker } from '../pipeline-progress';

const STEP_DEFS = [{ key: 'chapters', label: 'Generating narration audio' }];

export type TtsProgressTracker = PipelineProgressTracker;

/** Tracks a tts run's step-by-step progress, persisting it for the Output tab to poll and logging every transition. */
export function createTtsProgress(workflowId: string, activityId: string): TtsProgressTracker {
  return createPipelineProgress('workflow-tts', workflowId, activityId, STEP_DEFS);
}
