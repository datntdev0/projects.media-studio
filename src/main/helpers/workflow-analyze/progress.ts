import fs from 'node:fs';
import path from 'node:path';
import { createLogger } from '../logger';
import { getAppWorkflowExportDir } from '../paths';
import { AnalyzeStepStatus, type AnalyzeProgress, type AnalyzeStep } from '../../../shared/app-workflow-activity';

const logger = createLogger('workflow-analyze');

const STEP_DEFS: { key: string; label: string }[] = [
  { key: 'extract', label: 'Extracting chapters' },
  { key: 'merge', label: 'Merging world bible' },
  { key: 'resolve', label: 'Resolving conflicts' },
  { key: 'render', label: 'Rendering world bible' },
];

function progressPath(workflowId: string, activityId: string): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'progress', `${activityId}.json`);
}

export interface AnalyzeProgressTracker {
  start(key: string, detail?: string): void;
  update(key: string, detail: string): void;
  done(key: string, detail?: string): void;
  fail(key: string, detail: string): void;
}

/** Tracks an analyze run's step-by-step progress, persisting it to `<workflow dir>/progress/<activityId>.json` for the Output tab to poll and logging every transition. */
export function createAnalyzeProgress(workflowId: string, activityId: string): AnalyzeProgressTracker {
  const steps: AnalyzeStep[] = STEP_DEFS.map((def) => ({ key: def.key, label: def.label, status: AnalyzeStepStatus.Pending, detail: null }));
  const filePath = progressPath(workflowId, activityId);

  const findStep = (key: string): AnalyzeStep => steps.find((step) => step.key === key)!;

  const write = (): void => {
    const progress: AnalyzeProgress = { steps, updatedAt: Date.now() };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(progress), 'utf8');
  };

  write();

  return {
    start(key, detail) {
      const step = findStep(key);
      step.status = AnalyzeStepStatus.Running;
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
      step.status = AnalyzeStepStatus.Done;
      if (detail !== undefined) {
        step.detail = detail;
      }
      write();
      logger.info(`[${key}] ${step.label} done${step.detail ? ` — ${step.detail}` : ''}`);
    },
    fail(key, detail) {
      const step = findStep(key);
      step.status = AnalyzeStepStatus.Failed;
      step.detail = detail;
      write();
      logger.error(`[${key}] ${step.label} failed — ${detail}`);
    },
  };
}

/** Reads an analyze activity's current/last-run progress, or `null` if it has never been run. */
export function readAnalyzeProgress(workflowId: string, activityId: string): AnalyzeProgress | null {
  const filePath = progressPath(workflowId, activityId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AnalyzeProgress;
}
