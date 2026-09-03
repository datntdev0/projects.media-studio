import { AudioNovelIcon, VideoRecapIcon } from '@/components/icons';
import { formatDate } from '@/features/library/libraryFormat';
import { StepAvailability, WORKSPACE_PRESET_STEPS, WORKSPACE_STEP_NAME, WORKSPACE_STEP_UNIT, WorkspacePreset, WorkspaceStatus, WorkspaceStepKey, WorkspaceStepState, WorkspaceStepUnit, type AppWorkspace, type WorkspaceStep, type WorkspaceStepCounts, type WorkspaceStepProgress } from '@/shared/app-workspace';
import { WorkspaceRunMode, WorkspaceRunStatus, type AppWorkspaceRun, type WorkspaceRunStep } from '@/shared/app-workspace-run';

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

/** The shared step names, re-exported so a screen has one import for step copy. */
export const STEP_NAME = WORKSPACE_STEP_NAME;

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

/**
 * How far a step has got, measured over its own counts — a step done over part of
 * the novel reads as part of the way. With nothing to count, a finished step is
 * the only thing that can read as complete.
 */
export function progressPctOf(step: WorkspaceStepProgress): number {
  if (step.totalCount === 0) return step.state === WorkspaceStepState.Done ? 100 : 0;
  return Math.round((step.doneCount / step.totalCount) * 100);
}

export function progressLabelOf(workspace: AppWorkspace): string {
  const done = workspace.steps.filter((step) => step.state === WorkspaceStepState.Done).length;
  const running = workspace.steps.find((step) => step.state === WorkspaceStepState.Running);
  if (!running) return `${done}/${workspace.steps.length} steps done`;
  return `${done}/${workspace.steps.length} steps · ${STEP_NAME[running.key]} ${progressPctOf(running)}%`;
}

const UNIT_LABEL: Record<WorkspaceStepUnit, string> = {
  [WorkspaceStepUnit.Chapter]: 'Sub-step: a chapter',
  [WorkspaceStepUnit.Part]: 'Sub-step: an exporting part',
};

/** What one sub-step of a step covers. Frame Illustration has no unit yet — it is not released. */
export function stepUnitLabelOf(key: WorkspaceStepKey): string {
  return key === WorkspaceStepKey.FrameIllustration ? 'Coming soon' : UNIT_LABEL[WORKSPACE_STEP_UNIT[key]];
}

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

export function stepCountLabelOf(counts: WorkspaceStepCounts): string {
  if (counts.totalCount === 0) return 'not scoped yet';
  const counted = `${counts.doneCount} / ${counts.totalCount}`;
  return counts.failedCount === 0 ? counted : `${counted} · ${counts.failedCount} failed`;
}

/** What a step's own screen says in its header about the step's progress, read off the workspace row. */
export function stepTagOf(workspace: AppWorkspace, key: WorkspaceStepKey): { tag: string; tagClass: string; count: string } {
  const step = workspace.steps.find((candidate) => candidate.key === key);
  if (!step) return { tag: 'Off', tagClass: 'tag-neutral', count: 'Not in this pipeline' };
  return { tag: STEP_STATE_LABEL[step.state], tagClass: STEP_STATE_TAG_CLASS[step.state], count: stepCountLabelOf(step) };
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
export interface WorkspaceActivityStrip {
  title: string;
  detail: string;
  dotColor: string;
  pulsing: boolean;
}

export function activityStripOf(workspace: AppWorkspace): WorkspaceActivityStrip {
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

export const RUN_MODE_LABEL: Record<WorkspaceRunMode, string> = {
  [WorkspaceRunMode.Immediate]: 'Immediate',
  [WorkspaceRunMode.Scheduled]: 'Scheduled',
};

export const RUN_STATUS_LABEL: Record<WorkspaceRunStatus, string> = {
  [WorkspaceRunStatus.Queued]: 'Queued',
  [WorkspaceRunStatus.Scheduled]: 'Scheduled',
  [WorkspaceRunStatus.Running]: 'Running',
  [WorkspaceRunStatus.Completed]: 'Completed',
  [WorkspaceRunStatus.Failed]: 'Failed',
  [WorkspaceRunStatus.Cancelled]: 'Cancelled',
};

export const RUN_STATUS_TAG_CLASS: Record<WorkspaceRunStatus, string> = {
  [WorkspaceRunStatus.Queued]: 'tag-neutral',
  [WorkspaceRunStatus.Scheduled]: 'tag-neutral',
  [WorkspaceRunStatus.Running]: 'tag-primary',
  [WorkspaceRunStatus.Completed]: 'tag-accent',
  [WorkspaceRunStatus.Failed]: 'tag-outline',
  [WorkspaceRunStatus.Cancelled]: 'tag-neutral',
};

/** The run's own line under its title: the chapters it covers and when it ran. */
export function runRangeLabelOf(run: AppWorkspaceRun): string {
  const when = run.startedAt === null ? `booked ${formatDate(run.createdAt)}` : `started ${formatDate(run.startedAt)}`;
  const ended = run.endedAt === null ? '' : ` → ${formatDate(run.endedAt)}`;
  return `Ch. ${run.fromChapter}–${run.toChapter} · ${when}${ended}`;
}

/** One line of the overview's recent-activity feed. */
export interface WorkspaceActivityEntry {
  id: string;
  at: number;
  /** The step the line belongs to, or "Run" for the execution itself. */
  label: string;
  tagClass: string;
  message: string;
}

function subStepSuffix(step: WorkspaceRunStep): string {
  return step.totalCount === 0 ? '' : ` · ${stepCountLabelOf(step)} sub-steps`;
}

/**
 * The newest things that happened across a workspace's runs, newest first. Ties
 * are broken the other way round from insertion, so a step starting reads above
 * the execution that opened it in the same millisecond.
 */
export function recentActivitiesOf(runs: AppWorkspaceRun[], limit = 6): WorkspaceActivityEntry[] {
  const lines: { order: number; entry: WorkspaceActivityEntry }[] = [];
  const add = (entry: WorkspaceActivityEntry) => lines.push({ order: lines.length, entry });

  for (const run of runs) {
    const label = `Execution #${run.seq}`;
    const range = `ch. ${run.fromChapter}–${run.toChapter}`;

    add({
      id: `${run.id}:opened`,
      at: run.createdAt,
      label: 'Run',
      tagClass: 'tag-neutral',
      message: run.mode === WorkspaceRunMode.Immediate ? `${label} submitted · ${range}` : `${label} booked · ${range}`,
    });

    if (run.endedAt !== null) {
      add({ id: `${run.id}:ended`, at: run.endedAt, label: 'Run', tagClass: RUN_STATUS_TAG_CLASS[run.status], message: `${label} ${RUN_STATUS_LABEL[run.status].toLowerCase()}` });
    }

    for (const step of run.steps) {
      if (step.startedAt !== null) {
        add({ id: `${run.id}:${step.stepKey}:started`, at: step.startedAt, label: STEP_NAME[step.stepKey], tagClass: 'tag-primary', message: `Started${subStepSuffix(step)}` });
      }
      if (step.endedAt !== null) {
        add({
          id: `${run.id}:${step.stepKey}:ended`,
          at: step.endedAt,
          label: STEP_NAME[step.stepKey],
          tagClass: STEP_STATE_TAG_CLASS[step.state],
          message: `${STEP_STATE_LABEL[step.state]}${subStepSuffix(step)}${step.error ? ` · ${step.error}` : ''}`,
        });
      }
    }
  }

  return lines
    .sort((left, right) => right.entry.at - left.entry.at || right.order - left.order)
    .slice(0, limit)
    .map((line) => line.entry);
}
