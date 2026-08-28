// Shared step-progress tracker for a workflow's script-driven pipeline activities (Analyze,
// Translate) — persists to `<workflow dir>/progress/<activityId>.json` for the Output tab to poll,
// and logs every transition. One tracker instance per run; the step set is the calling pipeline's own.

import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from './logger';
import { getAppWorkflowExportDir } from './paths';
import { PipelineStepStatus, type PipelineProgress, type PipelineStep } from '../../shared/app-workflow-activity';

export interface PipelineStepDef {
  key: string;
  label: string;
}

export interface PipelineProgressTracker {
  start(key: string, detail?: string): void;
  update(key: string, detail: string): void;
  done(key: string, detail?: string): void;
  fail(key: string, detail: string): void;
}

function progressPath(workflowId: string, activityId: string): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'progress', `${activityId}.json`);
}

/** Tracks a pipeline run's step-by-step progress. `logNamespace` scopes the tracker's log lines to the calling pipeline (e.g. `workflow-analyze`, `workflow-translate`). */
export function createPipelineProgress(logNamespace: string, workflowId: string, activityId: string, stepDefs: PipelineStepDef[]): PipelineProgressTracker {
  const logger = createLogger(logNamespace);
  const steps: PipelineStep[] = stepDefs.map((def) => ({ key: def.key, label: def.label, status: PipelineStepStatus.Pending, detail: null }));
  const filePath = progressPath(workflowId, activityId);

  const findStep = (key: string): PipelineStep => steps.find((step) => step.key === key)!;

  const write = (): void => {
    const progress: PipelineProgress = { steps, updatedAt: Date.now() };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(progress), 'utf8');
  };

  write();

  return {
    start(key, detail) {
      const step = findStep(key);
      step.status = PipelineStepStatus.Running;
      step.detail = detail ?? null;
      write();
      logger.info(`[${key}] ${step.label}${detail ? ` — ${detail}` : ''}`);
    },
    update(key, detail) {
      const step = findStep(key);
      step.detail = detail;
      write();
      logger.info(`[${key}] ${step.label} — ${detail}`);
    },
    done(key, detail) {
      const step = findStep(key);
      step.status = PipelineStepStatus.Done;
      if (detail !== undefined) {
        step.detail = detail;
      }
      write();
      logger.info(`[${key}] ${step.label} done${step.detail ? ` — ${step.detail}` : ''}`);
    },
    fail(key, detail) {
      const step = findStep(key);
      step.status = PipelineStepStatus.Failed;
      step.detail = detail;
      write();
      logger.error(`[${key}] ${step.label} failed — ${detail}`);
    },
  };
}

/** Reads a pipeline activity's current/last-run progress, or `null` if it has never been run. */
export function readPipelineProgress(workflowId: string, activityId: string): PipelineProgress | null {
  const filePath = progressPath(workflowId, activityId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PipelineProgress;
}
