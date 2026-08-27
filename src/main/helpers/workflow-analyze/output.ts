import fs from 'node:fs';
import path from 'node:path';
import { getAppWorkflowExportDir } from '../paths';
import type { WorldBible } from './types';
import type { AnalyzeOutput, AnalyzeOutputCharacter, AnalyzeOutputGlossaryEntry, AnalyzeOutputPage, AnalyzeOutputTimelineGroup } from '../../../shared/app-workflow-activity';

interface AnalyzeStats {
  chaptersCovered: number;
  conflictsResolved: number;
}

interface LoadedWorld {
  world: WorldBible;
  stats: AnalyzeStats;
}

function chapterLabel(sceneId: string): string | null {
  const match = /^chapter-(\d+)-scene-\d+$/.exec(sceneId);
  return match ? `Ch. ${Number(match[1])}` : null;
}

/** Flattens a character's per-scene appearance details into a handful of unique "key: value" facts, for a one-line summary. */
function summarizeAppearance(appearance: WorldBible['characters'][number]['appearance']): string {
  const details = new Set<string>();
  for (const scene of appearance) {
    for (const { key, value } of scene.details) {
      details.add(`${key}: ${value}`);
    }
  }
  return [...details].slice(0, 4).join(', ');
}

function groupTimeline(world: WorldBible): AnalyzeOutputTimelineGroup[] {
  const byChapter = new Map<string, string[]>();
  for (const entry of world.timeline) {
    const label = chapterLabel(entry.idx);
    if (!label) {
      continue;
    }
    const scenes = byChapter.get(label) ?? [];
    scenes.push(entry.summary);
    byChapter.set(label, scenes);
  }
  return [...byChapter.entries()].map(([chapterId, scenes]) => ({ chapterId, scenes }));
}

function loadWorld(workflowId: string): LoadedWorld | null {
  const extractionDir = path.join(getAppWorkflowExportDir(workflowId), 'extraction');
  const worldPath = path.join(extractionDir, 'world.json');
  const statsPath = path.join(extractionDir, 'stats.json');
  if (!fs.existsSync(worldPath) || !fs.existsSync(statsPath)) {
    return null;
  }
  const world = JSON.parse(fs.readFileSync(worldPath, 'utf8')) as WorldBible;
  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8')) as AnalyzeStats;
  return { world, stats };
}

/**
 * Reads a workflow's already-produced analyze output (world bible + run stats) from its working
 * directory, or `null` if the Analyze activity hasn't finished a run yet. Character and timeline
 * detail — which can run into the thousands of entries for a long novel — aren't embedded here;
 * see `readAnalyzeCharacters`/`readAnalyzeTimeline`.
 */
export function readAnalyzeOutput(workflowId: string): AnalyzeOutput | null {
  const loaded = loadWorld(workflowId);
  if (!loaded) {
    return null;
  }
  const { world, stats } = loaded;

  return {
    summary: world.overview.summary,
    characterCount: world.characters.length,
    glossaryCount: world.overview.glossary.length,
    chaptersCovered: stats.chaptersCovered,
    conflictsResolved: stats.conflictsResolved,
    timelineGroupCount: groupTimeline(world).length,
  };
}

/** One page of the world bible's characters, for the Output tab's lazy-loaded Characters section. */
export function readAnalyzeCharacters(workflowId: string, offset: number, limit: number): AnalyzeOutputPage<AnalyzeOutputCharacter> {
  const loaded = loadWorld(workflowId);
  if (!loaded) {
    return { items: [], total: 0 };
  }
  const { characters } = loaded.world;
  const items = characters.slice(offset, offset + limit).map((character) => ({ name: character.name, aliasLabel: character.aliases.join(', '), appearance: summarizeAppearance(character.appearance) }));
  return { items, total: characters.length };
}

/** One page of the world bible's glossary, for the Output tab's lazy-loaded Glossary section. */
export function readAnalyzeGlossary(workflowId: string, offset: number, limit: number): AnalyzeOutputPage<AnalyzeOutputGlossaryEntry> {
  const loaded = loadWorld(workflowId);
  if (!loaded) {
    return { items: [], total: 0 };
  }
  const { glossary } = loaded.world.overview;
  const items = glossary.slice(offset, offset + limit).map((entry) => ({ term: entry.term, definition: entry.definition }));
  return { items, total: glossary.length };
}

/** One page of the world bible's timeline, grouped by chapter, for the Output tab's lazy-loaded Timeline section. */
export function readAnalyzeTimeline(workflowId: string, offset: number, limit: number): AnalyzeOutputPage<AnalyzeOutputTimelineGroup> {
  const loaded = loadWorld(workflowId);
  if (!loaded) {
    return { items: [], total: 0 };
  }
  const groups = groupTimeline(loaded.world);
  return { items: groups.slice(offset, offset + limit), total: groups.length };
}
