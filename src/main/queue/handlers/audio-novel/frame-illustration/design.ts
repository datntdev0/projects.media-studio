import { CHARACTER_WEIGHT_ORDER, sceneChapterNoOf, type WorldBible, type WorldCharacter } from '@/shared/app-workspace-extraction';
import type { WorldTranslation, WorldTranslationCharacter } from '@/shared/app-workspace-translation';
import type { ArtStyle, CharacterDesign, CharacterOutfitDesign, IllustrationDesign } from '@/shared/app-workspace-illustration';
import { plainSlug } from '@/shared/text';
import { baseLookPromptOf, outfitPromptOf } from './prompt';

/** Long outfit wordings exist; a file name still has to stay short. */
const MAX_SLUG_LENGTH = 32;

/** A name reduced to a file-name part, kept unique within `taken` by numbering the repeats. */
function uniqueSlug(name: string, fallback: string, taken: Set<string>): string {
  const base = plainSlug(name).slice(0, MAX_SLUG_LENGTH) || fallback;
  let slug = base;
  for (let repeat = 2; taken.has(slug); repeat += 1) {
    slug = `${base}${repeat}`;
  }
  taken.add(slug);
  return slug;
}

/** The scenes a character is in — where they are dressed, and where they stand in a relationship. */
function scenesOf(character: WorldTranslationCharacter): string[] {
  return [...new Set([...Object.keys(character.appearance), ...Object.keys(character.relationships)])];
}

/** The chapter a character first turns up in, 0 when the metadata never places them in a scene. */
function firstChapterOf(scenes: string[]): number {
  const chapters = scenes.map(sceneChapterNoOf).filter((chapterNo) => chapterNo > 0);
  return chapters.length === 0 ? 0 : Math.min(...chapters);
}

/**
 * The character's outfits, one card per distinct wording rather than per scene:
 * the same coat described the same way across ten scenes is drawn once and listed
 * against all ten, and the cards run in the order the story first wears them. The
 * wording that names the outfit in the prompt is the original's, since that is the
 * language the story was extracted in.
 */
function outfitsOf(translated: WorldTranslationCharacter, original: WorldCharacter | undefined, style: ArtStyle): CharacterOutfitDesign[] {
  const scenesByWording = new Map<string, string[]>();
  for (const [scene, wording] of Object.entries(translated.appearance)) {
    const key = wording.trim();
    if (key === '') continue;
    scenesByWording.set(key, [...(scenesByWording.get(key) ?? []), scene]);
  }

  const taken = new Set<string>();
  return [...scenesByWording.entries()]
    .map(([wording, scenes]) => ({ wording, scenes: scenes.sort() }))
    .sort((left, right) => left.scenes[0].localeCompare(right.scenes[0]))
    .map(({ wording, scenes }) => {
      const first = original?.appearance[scenes[0]]?.trim() || wording;
      return {
        slug: uniqueSlug(first, 'outfit', taken),
        original: first,
        translated: wording,
        scenes,
        prompt: outfitPromptOf(style, translated.nameOriginal || translated.name, original?.body ?? '', first),
      };
    });
}

function characterDesignOf(translated: WorldTranslationCharacter, original: WorldCharacter | undefined, style: ArtStyle, taken: Set<string>): CharacterDesign {
  const name = translated.nameOriginal || translated.name;
  const body = original?.body ?? '';
  const scenes = scenesOf(translated);
  return {
    slug: uniqueSlug(name, 'character', taken),
    name: translated.name,
    nameOriginal: translated.nameOriginal,
    weight: translated.weight,
    bodyOriginal: body,
    body: translated.body,
    sceneCount: scenes.length,
    firstChapter: firstChapterOf(scenes),
    basePrompt: baseLookPromptOf(style, name, body),
    outfits: outfitsOf(translated, original, style),
  };
}

/** A character the metadata never places in a scene sorts after every one it does. */
function appearanceKeyOf(firstChapter: number): number {
  return firstChapter === 0 ? Number.MAX_SAFE_INTEGER : firstChapter;
}

/**
 * The chapter each character first appears in, earliest first — the order the
 * story introduces them, and the order the design's rail lists them in. Two
 * introduced in the same chapter fall back to the main characters first, then
 * whoever is in the most scenes.
 */
function byFirstAppearance(left: CharacterDesign, right: CharacterDesign): number {
  const first = appearanceKeyOf(left.firstChapter) - appearanceKeyOf(right.firstChapter);
  if (first !== 0) return first;
  const weight = CHARACTER_WEIGHT_ORDER.indexOf(left.weight) - CHARACTER_WEIGHT_ORDER.indexOf(right.weight);
  return weight !== 0 ? weight : right.sceneCount - left.sceneCount;
}

/**
 * The character design derived from the world bible and its translation, in plain
 * code: one base look per character and one card per unique outfit. The prompts
 * are written for `style`, so a rebuild after a style change rewrites them —
 * which is also what discards a hand-edited prompt.
 */
export function buildDesign(source: WorldBible, world: WorldTranslation, style: ArtStyle): IllustrationDesign {
  const originals = new Map(source.characters.map((character) => [character.name, character]));
  const taken = new Set<string>();
  const characters = world.characters
    .map((character) => characterDesignOf(character, originals.get(character.nameOriginal), style, taken))
    .sort(byFirstAppearance);

  return { style, characters };
}
