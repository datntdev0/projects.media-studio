import { createPipelineProgress, type PipelineProgressTracker } from '../pipeline-progress';

const STEP_DEFS = [
  { key: 'extract', label: 'Extracting chapters' },
  { key: 'merge', label: 'Merging world bible' },
  { key: 'resolve', label: 'Resolving conflicts' },
  { key: 'render', label: 'Rendering world bible' },
];

export type AnalyzeProgressTracker = PipelineProgressTracker;

/** Tracks an analyze run's step-by-step progress, persisting it for the Output tab to poll and logging every transition. */
export function createAnalyzeProgress(workflowId: string, activityId: string): AnalyzeProgressTracker {
  return createPipelineProgress('workflow-analyze', workflowId, activityId, STEP_DEFS);
}
