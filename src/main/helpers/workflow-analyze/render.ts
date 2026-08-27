import type { WorldBible } from './types';

function renderOverview(overview: WorldBible['overview']): string[] {
  return ['## Story Overview', '', overview.summary, ''];
}

function renderGlossary(glossary: WorldBible['overview']['glossary']): string[] {
  const lines = ['## Glossary', '', '| Term | Category | Definition |', '| --- | --- | --- |'];
  for (const entry of glossary) {
    lines.push(`| ${entry.term} | ${entry.category} | ${entry.definition} |`);
  }
  lines.push('');
  return lines;
}

function renderCharacters(characters: WorldBible['characters']): string[] {
  const lines = ['## Character', '', '| Name | Aliases |', '| --- | --- |'];
  for (const character of characters) {
    lines.push(`| ${character.name} | ${character.aliases.join(', ') || '-'} |`);
  }
  lines.push('');
  return lines;
}

/** Renders a merged world bible's overview, glossary and character roster to Markdown — `glossary.md` under a workflow's `extraction/` directory. */
export function renderGlossaryMarkdown(world: WorldBible): string {
  return ['# Glossary', '', ...renderOverview(world.overview), ...renderGlossary(world.overview.glossary), ...renderCharacters(world.characters)].join('\n');
}
