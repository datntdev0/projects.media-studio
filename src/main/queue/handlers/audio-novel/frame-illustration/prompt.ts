import { artStyleOf, type ArtStyle } from '@/shared/app-workspace-illustration';

/**
 * Carried by every prompt with a person in it: a character keeps a non-sexual
 * silhouette and its canonical dignity. It is also what keeps an image tool's
 * safety system from refusing a sheet outright when the extracted body
 * description is read the wrong way.
 */
const CHARACTER_DECENCY = '全程着装完整，非性化取景，角色保持其应有的端正';

/** Said in the prompt when the metadata describes nothing, so the model is told to keep the look plain rather than invent one. */
const NO_DESCRIPTION = '角色描述缺失，外形保持朴素平常';

/**
 * The four views one sheet holds, left to right. A sheet is what every later
 * image is drawn against, so the layout is fixed rather than the caller's: the
 * closeup carries the face, the three standing views carry the build and the
 * costume from every side.
 */
const SHEET_VIEWS = '同一画面左至右并排四视图：人像特写、正视图、侧视图、后视图，character design sheet, character turnaround, portrait closeup + front view + side view + back view';

/** What has to be whole in each view — a cropped head or foot makes the sheet useless as a reference. */
const SHEET_FRAMING = '人像特写从头顶到锁骨完整入画，head to collarbone complete；三张全身立像从头顶到脚底完整入画，full body head to toe，不裁切头顶与脚部';

/** How the sheet is staged: nothing that would make one view differ from another. */
const SHEET_STAGING = '自然站立，双脚平行微分，双臂自然下垂，中性微表情，均匀柔光，前方主光加双侧补光，无硬阴影';

const SHEET_CONSISTENCY = '四视图的面容、发型、体型与服装完全一致，画面无文字、无水印、无标题叠字';

/**
 * One character design sheet in the picked style, built by interpolation and
 * nothing else. The style's anchor opens it and its closing tag and quality lock
 * end it; the sheet layout, framing, staging and consistency rules sit in between
 * in that order, so only the character itself is ever the caller's to write.
 */
function sheetPrompt(style: ArtStyle, subject: string[]): string {
  const rules = artStyleOf(style);
  return [
    `角色四视图设定图，${rules.anchor}`,
    SHEET_VIEWS,
    rules.characterTexture,
    ...subject,
    rules.sheetProportion,
    SHEET_FRAMING,
    `${SHEET_STAGING}，${rules.sheetBackdrop}`,
    SHEET_CONSISTENCY,
    CHARACTER_DECENCY,
    rules.closingTag,
    rules.qualityLock,
    `Avoid: ${rules.avoid}`,
  ].join(',\n');
}

/** The character's own body, face and features — the sheet every outfit is then drawn on top of. */
export function baseLookPromptOf(style: ArtStyle, name: string, body: string): string {
  return sheetPrompt(style, [
    `角色 ${name}：${body.trim() || NO_DESCRIPTION}`,
    '性别、年龄、五官与气质全部依据上述角色描述自然推导',
    '素颜状态，无妆容，无发饰，无配饰',
    artStyleOf(style).sheetBaseClothing,
  ]);
}

/**
 * One outfit as its own sheet, drawn over the character's base look sheet — which
 * is handed to the drawing as its reference image, so the face and build stay the
 * ones the base sheet settled and only the costume changes.
 */
export function outfitPromptOf(style: ArtStyle, name: string, body: string, outfit: string): string {
  return sheetPrompt(style, [
    '以该角色的基础形象四视图设定图为底图叠加服化，面容、发色、发长与体型完全不变',
    `角色 ${name}：${body.trim() || NO_DESCRIPTION}`,
    `本套服化：${outfit.trim()}，替换底图的素色打底服装`,
    '不改变站姿，不加入场景与环境，不加入任何手持道具',
  ]);
}

/**
 * One frame of a chapter — the moment it shows, in the scene it sits in, with the
 * cast held to their design sheets. This is a single composed image, so it carries
 * none of the sheet layout: only the style's own opening and closing material.
 */
export function framePromptOf(style: ArtStyle, scene: string, cast: string[], moment: string): string {
  const rules = artStyleOf(style);
  const parts = [rules.anchor];
  if (cast.length > 0) parts.push(rules.characterTexture);
  parts.push(`Wide 16:9 cinematic composition, ${moment.trim()}. Setting: ${scene.trim()}`);
  if (cast.length > 0) {
    parts.push(`Characters as designed: ${cast.join('; ')}`);
    parts.push('Each character keeps the face, hair, build and costume of their own character design sheet');
    parts.push(CHARACTER_DECENCY);
  }
  parts.push(rules.closingTag, rules.qualityLock, `Avoid: ${rules.avoid}`);
  return parts.join('. ');
}
