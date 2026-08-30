import { runLlmPrint, type LlmUsage } from '../llm-cli';
import type { AnalyzeEngine } from '../../../shared/app-workflow-activity';
import type { AppearanceEntry, ChapterExtraction, CharacterEntry, GlossaryEntry, WorldBible, WorldCharacterEntry } from './types';

const SUMMARY_TIMEOUT_MS = 300_000;

function summaryPrompt(chapterSummaries: string[]): string {
  const numbered = chapterSummaries.map((summary, i) => `${i + 1}. ${summary}`).join('\n');
  return `Here are a novel's per-chapter summaries, in reading order, in their original language:\n\n${numbered}\n\n
    Write one cohesive summary of the whole story, in the same language as the chapter summaries.
    Do not translate, do not over 500 words. Return only the summary text, no preamble.`;
}

function mergeGlossary(glossary: GlossaryEntry[], seen: Set<string>, entries: GlossaryEntry[]): void {
  for (const entry of entries) {
    if (seen.has(entry.term)) {
      continue;
    }
    seen.add(entry.term);
    glossary.push(entry);
  }
}

/** Unions two characters' appearance lists, keeping one entry per scene id — a later chapter's entry for the same scene id wins, mirroring the original `dict.update` semantics. */
function mergeAppearance(appearance: AppearanceEntry[], additions: AppearanceEntry[]): void {
  for (const addition of additions) {
    const existing = appearance.findIndex((entry) => entry.idx === addition.idx);
    if (existing === -1) {
      appearance.push(addition);
    } else {
      appearance[existing] = addition;
    }
  }
}

function mergeCharacters(characters: WorldCharacterEntry[], nameIndex: Map<string, number>, entries: CharacterEntry[]): void {
  for (const entry of entries) {
    const keys = [entry.name, ...entry.aliases];
    const existingIdx = keys.map((key) => nameIndex.get(key)).find((idx) => idx !== undefined);
    if (existingIdx === undefined) {
      const merged: WorldCharacterEntry = { name: entry.name, aliases: [...new Set(entry.aliases)], appearance: [...entry.appearance] };
      characters.push(merged);
      const idx = characters.length - 1;
      for (const key of keys) {
        if (!nameIndex.has(key)) {
          nameIndex.set(key, idx);
        }
      }
      continue;
    }
    const merged = characters[existingIdx];
    for (const alias of entry.aliases) {
      if (!merged.aliases.includes(alias)) {
        merged.aliases.push(alias);
      }
      if (!nameIndex.has(alias)) {
        nameIndex.set(alias, existingIdx);
      }
    }
    mergeAppearance(merged.appearance, entry.appearance);
  }
}

function mergeTimeline(timeline: WorldBible['timeline'], scenes: ChapterExtraction['timeline']): void {
  timeline.push(...scenes);
}

/** Merges every chapter extraction into one world bible, including — unless `generateSummary` is `false` — the single LLM call that synthesizes a cohesive story summary from the per-chapter ones. */
export async function mergeWorld(engine: AnalyzeEngine, chapters: ChapterExtraction[], generateSummary: boolean, onUsage?: (usage: LlmUsage) => void): Promise<WorldBible> {
  const world: WorldBible = { overview: { summary: '', glossary: [] }, characters: [], timeline: [] };
  const termSeen = new Set<string>();
  const nameIndex = new Map<string, number>();
  const chapterSummaries: string[] = [];

  for (const chapter of chapters) {
    chapterSummaries.push(chapter.overview.summary);
    mergeGlossary(world.overview.glossary, termSeen, chapter.overview.glossary);
    mergeCharacters(world.characters, nameIndex, chapter.characters);
    mergeTimeline(world.timeline, chapter.timeline);
  }

  if (generateSummary && chapterSummaries.length > 0) {
    const summary = await runLlmPrint(engine, summaryPrompt(chapterSummaries), { timeoutMs: SUMMARY_TIMEOUT_MS, onUsage });
    world.overview.summary = String(summary).trim();
  }

  return world;
}
