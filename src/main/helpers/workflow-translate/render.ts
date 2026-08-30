import type { TranslatedGlossary } from './types';

function renderGlossary(glossary: TranslatedGlossary['glossary']): string[] {
  const lines = ['## Glossary', '', '| Original Term | Translated Term | Category | Definition |', '| --- | --- | --- | --- |'];
  for (const entry of glossary) {
    lines.push(`| ${entry.term} | ${entry.translatedTerm} | ${entry.category} | ${entry.definition} |`);
  }
  lines.push('');
  return lines;
}

function renderCharacters(characters: TranslatedGlossary['characters']): string[] {
  const lines = ['## Characters', '', '| Version | Name | Alias |', '| --- | --- | --- |'];
  for (const character of characters) {
    lines.push(`| Original | ${character.name} | ${character.aliases.join(', ') || '-'} |`);
    lines.push(`| Translated | ${character.translatedName} | ${character.translatedAliases.join(', ') || '-'} |`);
  }
  lines.push('');
  return lines;
}

/** Renders a translate run's bilingual glossary to Markdown — `translation/<language>/glossary.<activityId>.md`, the reference every chapter's translation looks up original terms/names against. */
export function renderTranslatedGlossaryMarkdown(glossary: TranslatedGlossary): string {
  return ['# Translated Glossary', '', ...renderGlossary(glossary.glossary), ...renderCharacters(glossary.characters)].join('\n');
}
