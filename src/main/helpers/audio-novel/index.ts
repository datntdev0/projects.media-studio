import type { WorkspaceStepHandler } from '@/main/helpers/workspace-step';
import { WorkspaceStepKey } from '@/shared/app-workspace';
import { semanticAnalysisHandler } from './handler.semantic-analysis';
import { semanticTranslateHandler } from './handler.semantic-translate';
import { narrationSpeechHandler } from './handler.narration-speech';
import { frameIllustrationHandler } from './handler.frame-illustration';
import { exportHandler } from './handler.export';

/** The audio-novel preset's strategies, by the step each one works. */
export const AUDIO_NOVEL_STEP_HANDLERS: Record<WorkspaceStepKey, WorkspaceStepHandler> = {
  [WorkspaceStepKey.SemanticAnalysis]: semanticAnalysisHandler,
  [WorkspaceStepKey.SemanticTranslate]: semanticTranslateHandler,
  [WorkspaceStepKey.NarrationSpeech]: narrationSpeechHandler,
  [WorkspaceStepKey.FrameIllustration]: frameIllustrationHandler,
  [WorkspaceStepKey.Export]: exportHandler,
};
