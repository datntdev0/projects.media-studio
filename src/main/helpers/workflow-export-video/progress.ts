import { createPipelineProgress, type PipelineProgressTracker } from '../pipeline-progress';

const STEP_DEFS = [
  { key: 'chapters', label: 'Exporting per-chapter video' },
  { key: 'combine', label: 'Combining into final video' },
];

export type ExportVideoProgressTracker = PipelineProgressTracker;

/** Tracks an export-video run's step-by-step progress, persisting it for the Output tab to poll and logging every transition. */
export function createExportVideoProgress(workflowId: string, activityId: string): ExportVideoProgressTracker {
  return createPipelineProgress('workflow-export-video', workflowId, activityId, STEP_DEFS);
}
