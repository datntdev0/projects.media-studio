import { AudioNovelIcon, VideoRecapIcon } from '@/components/icons';
import { StepAvailability, WORKSPACE_PRESET_STEPS, WorkspacePreset, WorkspaceStatus, WorkspaceStepKey, WorkspaceStepState, type AppWorkspace, type WorkspaceStep } from '@/shared/app-workspace';

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

/** What one sub-step of a step covers — the unit its counts are in. */
export const STEP_UNIT: Record<WorkspaceStepKey, string> = {
  [WorkspaceStepKey.SemanticAnalysis]: 'Sub-step: a chapter',
  [WorkspaceStepKey.SemanticTranslate]: 'Sub-step: a chapter',
  [WorkspaceStepKey.NarrationSpeech]: 'Sub-step: a chapter',
  [WorkspaceStepKey.FrameIllustration]: 'Coming soon',
  [WorkspaceStepKey.Export]: 'Sub-step: an exporting part',
};

export const STEP_NOTE: Record<WorkspaceStepKey, string> = {
  [WorkspaceStepKey.SemanticAnalysis]: 'An LLM extracts characters, timelines and glossary per chapter, merged into global metadata.',
  [WorkspaceStepKey.SemanticTranslate]: 'A chapter can only be translated once its metadata is extracted.',
  [WorkspaceStepKey.NarrationSpeech]: 'Text-to-speech per chapter — a chapter needs its translation before speech.',
  [WorkspaceStepKey.FrameIllustration]: 'Scene illustrations generated from chapter metadata.',
  [WorkspaceStepKey.Export]: 'Chapters are grouped into parts — export starts when narration completes.',
};

export const AVAILABILITY_LABEL: Record<StepAvailability, string> = {
  [StepAvailability.Required]: 'Required',
  [StepAvailability.Optional]: 'Optional',
  [StepAvailability.Soon]: 'Optional',
};

export const STEP_STATE_TAG_CLASS: Record<WorkspaceStepState, string> = {
  [WorkspaceStepState.Pending]: 'tag-neutral',
  [WorkspaceStepState.Running]: 'tag-primary',
  [WorkspaceStepState.Done]: 'tag-accent',
  [WorkspaceStepState.Failed]: 'tag-outline',
  [WorkspaceStepState.Skipped]: 'tag-neutral',
};

/**
 * One row of the pipeline as the detail screen shows it: the preset's definition
 * plus this workspace's progress, which is missing for a step the workspace does
 * not run — an optional step left off, or one that is not released yet.
 */
export interface WorkspaceStepView {
  key: WorkspaceStepKey;
  idx: number;
  availability: StepAvailability;
  step: WorkspaceStep | undefined;
  tag: string;
  tagClass: string;
  countLabel: string;
  pct: number;
}

export function stepCountLabelOf(step: WorkspaceStep): string {
  if (step.totalCount === 0) return 'not scoped yet';
  const counted = `${step.doneCount} / ${step.totalCount}`;
  return step.failedCount === 0 ? counted : `${counted} · ${step.failedCount} failed`;
}

export function stepTooltipOf(step: WorkspaceStep): string {
  return `${STEP_NAME[step.key]} — ${STEP_STATE_LABEL[step.state]} · ${stepCountLabelOf(step)}`;
}

/** Every step the preset defines, in order — not just the ones this workspace runs. */
export function stepViewsOf(workspace: AppWorkspace): WorkspaceStepView[] {
  return WORKSPACE_PRESET_STEPS[workspace.preset].map((definition) => {
    const step = workspace.steps.find((candidate) => candidate.key === definition.key);
    const soon = definition.availability === StepAvailability.Soon;
    return {
      key: definition.key,
      idx: definition.idx,
      availability: definition.availability,
      step,
      tag: step ? STEP_STATE_LABEL[step.state] : soon ? 'Soon' : 'Off',
      tagClass: step ? STEP_STATE_TAG_CLASS[step.state] : soon ? 'tag-outline' : 'tag-neutral',
      countLabel: step ? stepCountLabelOf(step) : soon ? 'Coming soon' : 'Not in this pipeline',
      pct: step ? progressPctOf(step) : 0,
    };
  });
}

export function stepSoonNoteOf(view: WorkspaceStepView): string {
  const soon = view.availability === StepAvailability.Soon ? ' The pipeline skips it until then.' : '';
  return `Coming soon — this screen is not built yet. ${STEP_NOTE[view.key]}${soon}`;
}

/** The strip above the step content: what the workspace is doing right now. */
export interface WorkspaceActivity {
  title: string;
  detail: string;
  dotColor: string;
  pulsing: boolean;
}

export function activityOf(workspace: AppWorkspace): WorkspaceActivity {
  const muted = 'color-mix(in srgb, var(--color-text) 45%, transparent)';
  const active = workspace.steps.find((step) => step.state === WorkspaceStepState.Running);
  const failed = workspace.steps.find((step) => step.state === WorkspaceStepState.Failed);

  switch (workspace.status) {
    case WorkspaceStatus.Running:
      return {
        title: active ? `Running · Step ${orderLabelOf(active.idx)} ${STEP_NAME[active.key]}` : 'Running',
        detail: active ? `${stepCountLabelOf(active)} · steps run in order, one at a time` : 'Steps run in order, one at a time.',
        dotColor: 'var(--color-accent)',
        pulsing: true,
      };
    case WorkspaceStatus.Completed:
      return { title: 'Completed', detail: 'Every step of the pipeline has finished.', dotColor: 'var(--color-accent-700)', pulsing: false };
    case WorkspaceStatus.Failed:
      return {
        title: 'Failed',
        detail: failed ? `${STEP_NAME[failed.key]} stopped — ${stepCountLabelOf(failed)}.` : 'The last execution did not finish.',
        dotColor: '#8a2f2f',
        pulsing: false,
      };
    case WorkspaceStatus.Scheduled:
      return { title: 'Scheduled', detail: 'Waiting for its next scheduled execution.', dotColor: muted, pulsing: false };
    default:
      return { title: 'Not executed yet', detail: 'This workspace has never run — its steps are scoped on the first execution.', dotColor: muted, pulsing: false };
  }
}
