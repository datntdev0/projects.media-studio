import { AudioNovelIcon, VideoRecapIcon } from '../../components/icons';
import { WorkspacePreset, WorkspaceStatus, WorkspaceStepKey, WorkspaceStepState, type AppWorkspace, type WorkspaceStep } from '../../../shared/app-workspace';

export interface WorkspacePresetMeta {
  preset: WorkspacePreset;
  title: string;
  description: string;
  Icon: typeof AudioNovelIcon;
  available: boolean;
}

/** How each preset presents itself — its steps come from `WORKSPACE_PRESET_STEPS`, which main shares. */
export const PRESETS: WorkspacePresetMeta[] = [
  {
    preset: WorkspacePreset.AudioNovel,
    title: 'Audio Novel',
    description: 'Turns a library novel into narrated audio parts with covers and subtitles.',
    Icon: AudioNovelIcon,
    available: true,
  },
  {
    preset: WorkspacePreset.VideoRecap,
    title: 'Video Recap',
    description: 'Illustrated chapter recaps with motion. Coming soon.',
    Icon: VideoRecapIcon,
    available: false,
  },
];

export const STEP_NAME: Record<WorkspaceStepKey, string> = {
  [WorkspaceStepKey.SemanticAnalysis]: 'Semantic Analysis',
  [WorkspaceStepKey.SemanticTranslate]: 'Semantic Translate',
  [WorkspaceStepKey.NarrationSpeech]: 'Narration Speech',
  [WorkspaceStepKey.FrameIllustration]: 'Frame Illustration',
  [WorkspaceStepKey.Export]: 'Export',
};

export const STATUS_LABEL: Record<WorkspaceStatus, string> = {
  [WorkspaceStatus.Draft]: 'Draft',
  [WorkspaceStatus.Scheduled]: 'Scheduled',
  [WorkspaceStatus.Running]: 'Running',
  [WorkspaceStatus.Completed]: 'Completed',
  [WorkspaceStatus.Failed]: 'Failed',
};

export const STATUS_TAG_CLASS: Record<WorkspaceStatus, string> = {
  [WorkspaceStatus.Draft]: 'tag-neutral',
  [WorkspaceStatus.Scheduled]: 'tag-neutral',
  [WorkspaceStatus.Running]: 'tag-primary',
  [WorkspaceStatus.Completed]: 'tag-accent',
  [WorkspaceStatus.Failed]: 'tag-outline',
};

export const STEP_STATE_LABEL: Record<WorkspaceStepState, string> = {
  [WorkspaceStepState.Pending]: 'Waiting',
  [WorkspaceStepState.Running]: 'Running',
  [WorkspaceStepState.Done]: 'Done',
  [WorkspaceStepState.Failed]: 'Failed',
  [WorkspaceStepState.Skipped]: 'Skipped',
};

export function presetMetaOf(preset: WorkspacePreset): WorkspacePresetMeta {
  return PRESETS.find((meta) => meta.preset === preset) ?? PRESETS[0];
}

/** The step's position as the pipeline shows it — "01".."05". */
export function orderLabelOf(idx: number): string {
  return String(idx).padStart(2, '0');
}

export function progressPctOf(step: WorkspaceStep): number {
  if (step.state === WorkspaceStepState.Done) return 100;
  if (step.totalCount === 0) return 0;
  return Math.round((step.doneCount / step.totalCount) * 100);
}

export function progressLabelOf(workspace: AppWorkspace): string {
  const done = workspace.steps.filter((step) => step.state === WorkspaceStepState.Done).length;
  const running = workspace.steps.find((step) => step.state === WorkspaceStepState.Running);
  if (!running) return `${done}/${workspace.steps.length} steps done`;
  return `${done}/${workspace.steps.length} steps · ${STEP_NAME[running.key]} ${progressPctOf(running)}%`;
}

export function stepTooltipOf(step: WorkspaceStep): string {
  const counted = step.totalCount === 0 ? 'not scoped yet' : `${step.doneCount}/${step.totalCount}`;
  return `${STEP_NAME[step.key]} — ${STEP_STATE_LABEL[step.state]} · ${counted}`;
}
