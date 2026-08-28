/** One glossary term, original and translated side by side — the pairing a chapter's translation looks up to render that term consistently. */
export interface TranslatedGlossaryEntry {
  term: string;
  translatedTerm: string;
  category: string;
  definition: string;
}

/** One character, original and translated name/aliases side by side. */
export interface TranslatedCharacterEntry {
  name: string;
  translatedName: string;
  aliases: string[];
  translatedAliases: string[];
}

/** The whole-book bilingual reference a translate run builds once (`translation/<language>/glossary.json`) and every chapter's translation reuses. */
export interface TranslatedGlossary {
  glossary: TranslatedGlossaryEntry[];
  characters: TranslatedCharacterEntry[];
}
