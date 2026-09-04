import { CharacterWeight, sceneChapterNoOf } from '@/shared/app-workspace-extraction';
import { BASE_LOOK_SLUG, characterImageFile, frameImageFile, type ArtStyle, type CharacterDesign, type CharacterOutfitDesign, type IllustrationDesign, type WorkspaceIllustrationChapter } from '@/shared/app-workspace-illustration';
import type { ChapterRailTag } from './translationFormat';

const WEIGHT_LABEL: Record<CharacterWeight, string> = {
  [CharacterWeight.Main]: 'Main',
  [CharacterWeight.Supporting]: 'Supporting',
  [CharacterWeight.Minor]: 'Minor',
};

/** A drawable of the design — a base look or one outfit — as a card shows it. */
export interface DesignImageState {
  file: string;
  /** Where the renderer loads it from, or undefined until it has been drawn. */
  url: string | undefined;
  tag: string;
  tagClass: string;
  /** What the card's own button says. */
  cta: string;
}

function imageStateOf(file: string, images: Record<string, string>, kind: string): DesignImageState {
  const url = images[file];
  return { file, url, tag: url ? 'Generated' : 'Missing', tagClass: url ? 'tag-accent' : 'tag-outline', cta: url ? 'Regenerate' : `Generate ${kind}` };
}

export function baseLookImageOf(character: CharacterDesign, style: ArtStyle, images: Record<string, string>): DesignImageState {
  return imageStateOf(characterImageFile(character.slug, BASE_LOOK_SLUG, style), images, 'base look');
}

export function outfitImageOf(character: CharacterDesign, outfitSlug: string, style: ArtStyle, images: Record<string, string>): DesignImageState {
  return imageStateOf(characterImageFile(character.slug, outfitSlug, style), images, 'outfit');
}

export function frameImageOf(frameIdx: number, style: ArtStyle, images: Record<string, string>): DesignImageState {
  return imageStateOf(frameImageFile(frameIdx, style), images, 'frame');
}

/** How many of a character's images are still to be drawn — the base look counts as one. */
export function missingCountOf(character: CharacterDesign, style: ArtStyle, images: Record<string, string>): number {
  const outfits = character.outfits.filter((outfit) => outfitImageOf(character, outfit.slug, style, images).url === undefined).length;
  return outfits + (baseLookImageOf(character, style, images).url === undefined ? 1 : 0);
}

export function designMissingCountOf(design: IllustrationDesign | null, style: ArtStyle, images: Record<string, string>): number {
  return (design?.characters ?? []).reduce((total, character) => total + missingCountOf(character, style, images), 0);
}

/** The chapter an outfit is first worn in — the order the cards are listed in. */
function outfitFirstChapterOf(outfit: CharacterOutfitDesign): number {
  return outfit.scenes.length === 0 ? 0 : sceneChapterNoOf(outfit.scenes[0]);
}

/** The rail's sub-line for one character — when the story introduces them, how they weigh in it, and how much there is to draw. */
export function characterSubLabelOf(character: CharacterDesign): string {
  const outfits = `${character.outfits.length} outfit${character.outfits.length === 1 ? '' : 's'}`;
  const first = character.firstChapter ? `Ch.${character.firstChapter}` : 'Unplaced';
  return `${first} · ${WEIGHT_LABEL[character.weight]} · ${character.sceneCount} scene(s) · ${outfits}`;
}

export function characterKickerOf(character: CharacterDesign): string {
  const first = character.firstChapter ? `first in chapter ${character.firstChapter}` : 'never placed in a scene';
  return `${WEIGHT_LABEL[character.weight]} character · ${first} · ${character.sceneCount} scene(s) · ${character.outfits.length} outfit(s)`;
}

/** One outfit card's scene line — when it is first worn, and how much of the story wears it. */
export function outfitSceneLabelOf(outfit: CharacterOutfitDesign): string {
  const worn = `worn in ${outfit.scenes.length} scene(s)`;
  const first = outfitFirstChapterOf(outfit);
  return first ? `First in chapter ${first} · ${worn}` : worn;
}

export function characterRailTagOf(character: CharacterDesign, style: ArtStyle, images: Record<string, string>): { label: string; tagClass: string } {
  const missing = missingCountOf(character, style, images);
  if (missing === 0) return { label: 'Drawn', tagClass: 'tag-accent' };
  return { label: `${missing} left`, tagClass: 'tag-outline' };
}

export function frameRailTagOf(chapter: WorkspaceIllustrationChapter): ChapterRailTag {
  if (!chapter.narrated) return { label: 'Blocked', tagClass: 'tag-outline', open: false, tip: 'No narration yet — frames are cut against the .srt timeline, so audio comes first.' };
  if (chapter.frameCount === 0) return { label: 'Queued', tagClass: 'tag-neutral', open: true, tip: 'Not planned yet' };
  if (chapter.drawnCount === chapter.frameCount) return { label: 'Done', tagClass: 'tag-accent', open: true, tip: chapter.title };
  return { label: 'Partial', tagClass: 'tag-neutral', open: true, tip: chapter.title };
}

/** The rail row's sub-line for one chapter — its frames, and how many are drawn. */
export function frameCountLabelOf(chapter: WorkspaceIllustrationChapter): string {
  if (!chapter.narrated) return 'No narration';
  if (chapter.frameCount === 0) return 'Not planned yet';
  const missing = chapter.frameCount - chapter.drawnCount;
  const drawn = `${chapter.frameCount} frames · ${chapter.drawnCount} done`;
  return missing === 0 ? drawn : `${drawn} · ${missing} missing`;
}

/** The header's count line — characters fully drawn over the design, or why there is no design. */
export function designCountLabelOf(design: IllustrationDesign | null, style: ArtStyle, images: Record<string, string>): string {
  if (!design || design.characters.length === 0) return 'No characters designed yet';
  const drawn = design.characters.filter((character) => missingCountOf(character, style, images) === 0).length;
  return `${drawn} / ${design.characters.length} characters fully drawn`;
}
