import type { Db } from '../database/client';
import { getAppWorkflow } from '../database/repositories/app-workflow.repo';
import {
  createAppWorkflowActivity,
  deleteAppWorkflowActivity,
  getAppWorkflowActivity,
  listAppWorkflowActivities,
  updateAppWorkflowActivity,
  type AppWorkflowActivityDraft,
} from '../database/repositories/app-workflow-activity.repo';
import { readAnalyzeCharacters, readAnalyzeGlossary, readAnalyzeOutput, readAnalyzeTimeline } from '../helpers/workflow-analyze';
import { readTranslateChapterText, readTranslateChapters, readTranslateOutput } from '../helpers/workflow-translate';
import { readPipelineProgress } from '../helpers/pipeline-progress';
import {
  AppWorkflowActivityType,
  type AnalyzeOutput,
  type AnalyzeOutputCharacter,
  type AnalyzeOutputGlossaryEntry,
  type AnalyzeOutputTimelineGroup,
  type AppWorkflowActivity,
  type AppWorkflowActivityConfig,
  type CreateAppWorkflowActivityInput,
  type PipelineOutputPage,
  type PipelineProgress,
  type TranslateOutput,
  type TranslateOutputChapter,
  type UpdateAppWorkflowActivityInput,
} from '../../shared/app-workflow-activity';

export interface AppWorkflowActivityManager {
  list(workflowId: string): AppWorkflowActivity[];
  create(workflowId: string, input: CreateAppWorkflowActivityInput): AppWorkflowActivity;
  update(workflowId: string, id: string, input: UpdateAppWorkflowActivityInput): AppWorkflowActivity;
  remove(workflowId: string, id: string): void;
  getAnalyzeOutput(workflowId: string, id: string): AnalyzeOutput | null;
  getPipelineProgress(workflowId: string, id: string): PipelineProgress | null;
  getAnalyzeCharacters(workflowId: string, id: string, offset: number, limit: number): PipelineOutputPage<AnalyzeOutputCharacter>;
  getAnalyzeGlossary(workflowId: string, id: string, offset: number, limit: number): PipelineOutputPage<AnalyzeOutputGlossaryEntry>;
  getAnalyzeTimeline(workflowId: string, id: string, offset: number, limit: number): PipelineOutputPage<AnalyzeOutputTimelineGroup>;
  getTranslateOutput(workflowId: string, id: string): TranslateOutput | null;
  getTranslateChapters(workflowId: string, id: string, offset: number, limit: number): PipelineOutputPage<TranslateOutputChapter>;
  getTranslateChapterText(workflowId: string, id: string, chapterId: string): string | null;
}

const DEFAULT_RETRY = 3;
const DEFAULT_DELAY = 30;

function configOf(activity: AppWorkflowActivity): AppWorkflowActivityConfig {
  return (activity.analyzeConfig ?? activity.translateConfig ?? activity.profilesConfig ?? activity.storyboardConfig ?? activity.ttsConfig)!;
}

export function createAppWorkflowActivityManager(db: Db): AppWorkflowActivityManager {
  const needWorkflow = (workflowId: string) => {
    const workflow = getAppWorkflow(db, workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);
    return workflow;
  };

  const needActivity = (workflowId: string, id: string): AppWorkflowActivity => {
    const activity = getAppWorkflowActivity(db, workflowId, id);
    if (!activity) throw new Error(`Activity ${id} not found on workflow ${workflowId}`);
    return activity;
  };

  const needDependencies = (workflowId: string, dependencies: string[], selfId?: string): string[] => {
    const unique = [...new Set(dependencies)];
    if (selfId && unique.includes(selfId)) throw new Error('An activity cannot depend on itself.');
    if (unique.some((dependsOnId) => !getAppWorkflowActivity(db, workflowId, dependsOnId))) {
      throw new Error('Every dependency must be an activity on this workflow.');
    }
    return unique;
  };

  return {
    list: (workflowId) => listAppWorkflowActivities(db, workflowId),

    create: (workflowId, input) => {
      needWorkflow(workflowId);

      const draft: AppWorkflowActivityDraft = {
        type: input.type,
        name: input.name,
        description: input.description ?? '',
        x: input.x,
        y: input.y,
        retry: input.retry ?? DEFAULT_RETRY,
        delay: input.delay ?? DEFAULT_DELAY,
        enabled: input.enabled ?? true,
        config: input.config,
        dependencies: input.dependencies ? needDependencies(workflowId, input.dependencies) : [],
      };

      return createAppWorkflowActivity(db, workflowId, draft);
    },

    update: (workflowId, id, input) => {
      const current = needActivity(workflowId, id);

      const draft: AppWorkflowActivityDraft = {
        type: current.type,
        name: input.name ?? current.name,
        description: input.description ?? current.description,
        x: input.x ?? current.x,
        y: input.y ?? current.y,
        retry: input.retry ?? current.retry,
        delay: input.delay ?? current.delay,
        enabled: input.enabled ?? current.enabled,
        config: input.config ?? configOf(current),
        dependencies: input.dependencies ? needDependencies(workflowId, input.dependencies, id) : current.dependencies,
      };

      return updateAppWorkflowActivity(db, workflowId, id, draft);
    },

    remove: (workflowId, id) => {
      needActivity(workflowId, id);
      deleteAppWorkflowActivity(db, workflowId, id);

      for (const activity of listAppWorkflowActivities(db, workflowId)) {
        if (!activity.dependencies.includes(id)) continue;
        updateAppWorkflowActivity(db, workflowId, activity.id, {
          type: activity.type,
          name: activity.name,
          description: activity.description,
          x: activity.x,
          y: activity.y,
          retry: activity.retry,
          delay: activity.delay,
          enabled: activity.enabled,
          config: configOf(activity),
          dependencies: activity.dependencies.filter((dependsOnId) => dependsOnId !== id),
        });
      }
    },

    getAnalyzeOutput: (workflowId, id) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Analyze ? readAnalyzeOutput(workflowId) : null;
    },

    // Progress files are keyed only by activity id, not by activity type, so every script-driven
    // pipeline activity (Analyze, Translate) shares this one reader.
    getPipelineProgress: (workflowId, id) => {
      needActivity(workflowId, id);
      return readPipelineProgress(workflowId, id);
    },

    getAnalyzeCharacters: (workflowId, id, offset, limit) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Analyze ? readAnalyzeCharacters(workflowId, offset, limit) : { items: [], total: 0 };
    },

    getAnalyzeGlossary: (workflowId, id, offset, limit) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Analyze ? readAnalyzeGlossary(workflowId, offset, limit) : { items: [], total: 0 };
    },

    getAnalyzeTimeline: (workflowId, id, offset, limit) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Analyze ? readAnalyzeTimeline(workflowId, offset, limit) : { items: [], total: 0 };
    },

    getTranslateOutput: (workflowId, id) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Translate ? readTranslateOutput(workflowId, activity.translateConfig!.language) : null;
    },

    getTranslateChapters: (workflowId, id, offset, limit) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Translate ? readTranslateChapters(workflowId, activity.translateConfig!.language, offset, limit) : { items: [], total: 0 };
    },

    getTranslateChapterText: (workflowId, id, chapterId) => {
      const activity = needActivity(workflowId, id);
      return activity.type === AppWorkflowActivityType.Translate ? readTranslateChapterText(workflowId, activity.translateConfig!.language, chapterId) : null;
    },
  };
}
