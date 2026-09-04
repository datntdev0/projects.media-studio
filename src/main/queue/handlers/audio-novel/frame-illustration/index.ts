import { readWorldBible } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { readWorldTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import { frameImageFile, type ArtStyle, type IllustrationDesign } from '@/shared/app-workspace-illustration';
import { buildDesign } from './design';
import { hasFrameImage, readDesign, readFramePlan, writeDesign } from './store';

export { baseLookPromptOf, framePromptOf, outfitPromptOf } from './prompt';
export { drawCharacterImage, drawFrameImage, drawMissingReferences } from './draw';
export { planChapterFrames } from './frames';
export { characterImagePath, characterImageUrls, designWrittenAt, frameImagePath, frameImageUrls, hasCharacterImage, hasFrameImage, readDesign, readFramePlan, writeDesign, writeFramePlan } from './store';

/** Said by the screen's button and by the step, so both name the same fix. */
export const NOTHING_TRANSLATED_MESSAGE = 'Semantic Translate has not translated the metadata yet — there is nothing to design characters from.';

/**
 * Rebuilds `design.json` from the world bible and its translation. The prompts
 * are derived, so this discards whatever was edited on the screen — which is also
 * how a change of art style rewrites them.
 */
export function rebuildDesign(workspaceName: string, style: ArtStyle): IllustrationDesign {
  const source = readWorldBible(workspaceName);
  const world = readWorldTranslation(workspaceName);
  if (!source || !world) throw new Error(NOTHING_TRANSLATED_MESSAGE);

  const design = buildDesign(source, world, style);
  writeDesign(workspaceName, design);
  return design;
}

/** The design as it stands, built first if it has never been — what a caller that needs one starts from. */
export function requireDesign(workspaceName: string, style: ArtStyle): IllustrationDesign {
  return readDesign(workspaceName) ?? rebuildDesign(workspaceName, style);
}

/** How many frames a chapter is planned into, and how many of them are drawn in `style`. */
export function frameCountsOf(workspaceName: string, chapterNo: number, style: ArtStyle): { frameCount: number; drawnCount: number } {
  const frames = readFramePlan(workspaceName, chapterNo)?.frames ?? [];
  const drawn = frames.filter((frame) => hasFrameImage(workspaceName, chapterNo, frameImageFile(frame.idx, style)));
  return { frameCount: frames.length, drawnCount: drawn.length };
}
