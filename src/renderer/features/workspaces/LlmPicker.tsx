import { LLM_ENGINE_LABEL, LlmEngine, firstModelOf, type LlmOptions, type LlmSettings } from '@/shared/llm';

interface LlmPickerProps {
  /** Null until this workspace has picked — config.json names models, never an engine. */
  llm: LlmSettings | null;
  options: LlmOptions;
  disabled: boolean;
  onChange(llm: LlmSettings): void;
}

/**
 * Which CLI this workspace's LLM steps call. There is no default: nothing runs
 * until an engine is picked here, and picking one takes that engine's first
 * configured model, since a model belongs to one engine only. The lists come
 * from `llm.models` in config.json, so adding a model is a config change rather
 * than a code one.
 */
export function LlmPicker({ llm, options, disabled, onChange }: LlmPickerProps) {
  const models = llm ? options.models[llm.engine] ?? [] : [];
  // A model the config no longer lists is still shown — it is what the chapters already extracted were extracted with.
  const shown = !llm || models.includes(llm.model) ? models : [llm.model, ...models];

  return (
    <>
      <select
        className="input"
        style={{ width: 120, fontSize: 13 }}
        value={llm?.engine ?? ''}
        disabled={disabled}
        onChange={(e) => {
          const engine = e.target.value as LlmEngine;
          onChange({ engine, model: firstModelOf(options, engine) });
        }}
      >
        {!llm && <option value="">Pick engine…</option>}
        {options.engines.map((engine) => (
          <option key={engine} value={engine}>{LLM_ENGINE_LABEL[engine]}</option>
        ))}
      </select>
      <select
        className="input"
        style={{ width: 180, fontSize: 13 }}
        value={llm?.model ?? ''}
        disabled={disabled || !llm}
        onChange={(e) => llm && onChange({ engine: llm.engine, model: e.target.value })}
      >
        {!llm && <option value="">No model</option>}
        {shown.map((model) => (
          <option key={model} value={model}>{model}</option>
        ))}
      </select>
    </>
  );
}
