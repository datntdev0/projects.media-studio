import { chapterFileStem } from '@/main/helpers/chapter-files';
import { generateImage } from '@/main/helpers/image-cli';
import { logger } from '@/main/helpers/logger';
import { getAppWorkspaceIllustrationDir } from '@/main/helpers/paths';
import type { AppWorkspace } from '@/shared/app-workspace';
import { BASE_LOOK_SLUG, characterImageFile, frameImageFile, type ArtStyle, type CharacterDesign, type IllustrationDesign } from '@/shared/app-workspace-illustration';
import { CHARACTERS_DIR, FRAMES_DIR, hasCharacterImage, readFramePlan } from './store';

/** The shapes the two kinds of image are asked for — a sheet is wide because it holds four views side by side, a frame is the video's own. */
const SHEET_SHAPE = 'the widest landscape image your tool offers, at least 2:1 and at least 1536x768 pixels — it has to hold four views side by side';
const FRAME_SHAPE = 'a 16:9 landscape image, at least 1536x864 pixels';

/**
 * What a reference image settles. Every reference is a four-view character design
 * sheet, and the two kinds of drawing take opposite things from one: an outfit is
 * another sheet of the same character re-dressed, so the layout is kept and only
 * the clothing moves, while a frame is a single scene, so the identity is kept and
 * the layout must not be copied.
 */
const OUTFIT_REFERENCE_RULE = 'That is this character\'s base design sheet. Keep its face, hairstyle, hair colour and build exactly, and keep the same four views in the same order; the clothing is the one thing that changes, to the costume named above.';
const FRAME_REFERENCE_RULE = 'Those are character design sheets, not compositions to copy: take each character\'s face, hairstyle, build and costume from them exactly, then draw one single cinematic scene of the moment above — never a turnaround, never views side by side.';

/** A path under the workspace illustrations folder, as codex is given it — always with forward slashes. */
function relativePath(segments: string[]): string {
  return segments.join('/');
}

function characterOf(design: IllustrationDesign, characterSlug: string): CharacterDesign {
  const character = design.characters.find((candidate) => candidate.slug === characterSlug);
  if (!character) throw new Error(`The design has no character '${characterSlug}' — rebuild it from the metadata.`);
  return character;
}

/**
 * Draws one character image from the prompt saved for it. An outfit is drawn
 * against the character's own base look, so the face and build stay the ones it
 * was designed with; the base look itself has nothing to hold to and is drawn
 * from its prompt alone.
 */
export async function drawCharacterImage(workspace: AppWorkspace, design: IllustrationDesign, characterSlug: string, outfitSlug: string): Promise<string> {
  const character = characterOf(design, characterSlug);
  const isBase = outfitSlug === BASE_LOOK_SLUG;
  const outfit = isBase ? undefined : character.outfits.find((candidate) => candidate.slug === outfitSlug);
  if (!isBase && !outfit) throw new Error(`${character.name || character.nameOriginal} has no outfit '${outfitSlug}' — rebuild the design from the metadata.`);

  const baseFile = characterImageFile(character.slug, BASE_LOOK_SLUG, workspace.artStyle);
  const references = !isBase && hasCharacterImage(workspace.name, baseFile) ? [relativePath([CHARACTERS_DIR, baseFile])] : [];
  const target = relativePath([CHARACTERS_DIR, characterImageFile(character.slug, outfitSlug, workspace.artStyle)]);

  logger.info(`[illustration] drawing ${target}`);
  await generateImage({
    dir: getAppWorkspaceIllustrationDir(workspace.name),
    prompt: outfit ? outfit.prompt : character.basePrompt,
    target,
    references,
    referenceRule: OUTFIT_REFERENCE_RULE,
    shape: SHEET_SHAPE,
  });
  return target;
}

/** The character and outfit one image file name stands for, or undefined when the design no longer has it. */
function drawableOf(design: IllustrationDesign, style: ArtStyle, file: string): { character: CharacterDesign; outfitSlug: string } | undefined {
  for (const character of design.characters) {
    for (const outfitSlug of [BASE_LOOK_SLUG, ...character.outfits.map((outfit) => outfit.slug)]) {
      if (characterImageFile(character.slug, outfitSlug, style) === file) return { character, outfitSlug };
    }
  }
  return undefined;
}

/**
 * Draws whichever of a frame's character images are still missing, base look
 * first — an outfit is drawn on top of that look, so it has to exist by the time
 * the outfit is asked for. This is how a run designs each character once: the
 * first frame that needs a look pays for it and every later one finds it drawn.
 */
export async function drawMissingReferences(workspace: AppWorkspace, design: IllustrationDesign, refs: string[]): Promise<void> {
  for (const file of refs) {
    const drawable = drawableOf(design, workspace.artStyle, file);
    if (!drawable || hasCharacterImage(workspace.name, file)) continue;

    const base = characterImageFile(drawable.character.slug, BASE_LOOK_SLUG, workspace.artStyle);
    if (!hasCharacterImage(workspace.name, base)) {
      await drawCharacterImage(workspace, design, drawable.character.slug, BASE_LOOK_SLUG);
    }
    if (drawable.outfitSlug !== BASE_LOOK_SLUG) {
      await drawCharacterImage(workspace, design, drawable.character.slug, drawable.outfitSlug);
    }
  }
}

/**
 * Draws one frame of a chapter from the prompt its plan holds, against the
 * character images that plan named — so the cast keeps the look the design gave
 * it. A frame whose cast has never been drawn is still drawn, from its prompt alone.
 */
export async function drawFrameImage(workspace: AppWorkspace, chapterNo: number, frameIdx: number): Promise<string> {
  const frame = readFramePlan(workspace.name, chapterNo)?.frames.find((candidate) => candidate.idx === frameIdx);
  if (!frame) throw new Error(`Chapter ${chapterNo} has no frame ${frameIdx} — plan its frames first.`);

  const references = frame.refs.filter((file) => hasCharacterImage(workspace.name, file)).map((file) => relativePath([CHARACTERS_DIR, file]));
  const target = relativePath([FRAMES_DIR, chapterFileStem(chapterNo), frameImageFile(frame.idx, workspace.artStyle)]);

  logger.info(`[illustration] drawing ${target}`);
  await generateImage({
    dir: getAppWorkspaceIllustrationDir(workspace.name),
    prompt: frame.prompt,
    target,
    references,
    referenceRule: FRAME_REFERENCE_RULE,
    shape: FRAME_SHAPE,
  });
  return target;
}
