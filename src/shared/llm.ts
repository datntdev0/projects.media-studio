// Which LLM a workspace's steps call. The app drives a locally installed coding
// CLI rather than an HTTP API, so an engine is a command on PATH (`claude`,
// `codex`) and a model is whatever that command accepts. Which models each
// engine offers is config.json's to say — see `llm` there — so a new model needs
// no code change.

export enum LlmEngine {
  Claude = 'claude',
  Codex = 'codex',
}

export const LLM_ENGINE_LABEL: Record<LlmEngine, string> = {
  [LlmEngine.Claude]: 'Claude CLI',
  [LlmEngine.Codex]: 'Codex CLI',
};

/** One engine and one of its models — what a step actually calls. */
export interface LlmSettings {
  engine: LlmEngine;
  model: string;
}

/** What the pickers may offer: the engines that have models configured, and each one's models. */
export interface LlmOptions {
  engines: LlmEngine[];
  models: Record<string, string[]>;
}

/** The engine's first configured model — what a workspace gets when it switches engine. */
export function firstModelOf(options: LlmOptions, engine: LlmEngine): string {
  return options.models[engine]?.[0] ?? '';
}
