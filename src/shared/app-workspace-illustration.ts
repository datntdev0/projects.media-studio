// Types and IPC contract for what the Frame Illustration step produces. Like the
// translations it is derived from, it lives on disk under the workspace's own
// working directory (see helpers/paths.ts):
//
//   appDir/data/workspaces/<slug>/illustrations/
//   ├── design.json                              every character's base look and unique outfits
//   ├── characters/
//   │   ├── sera.base.guofeng2d.png              the base look — body, face, features, no outfit
//   │   └── sera.saltstiffcoat.guofeng2d.png     one outfit drawn on top of that look
//   └── frames/chapter-0388/
//       ├── frames.json                          the chapter cut into frames along its .srt
//       └── frame-01.guofeng2d.png
//
// Images are scoped by art style (`ArtStyleRules.tag`) the way narration audio is
// scoped by voice, so every style keeps its own and switching the pick shows what
// was drawn that way. The design is built from `world.vi.json` in plain code and
// is what the step's screen edits; the frame plans are cut by the LLM.

import type { CharacterWeight } from './app-workspace-extraction';
import type { LlmSettings } from './llm';

/**
 * The art styles the step can draw in — the variants of the project's
 * `workflow-thumbnail` skill (see `.codex/skills/workflow-thumbnail/references/art-styles.md`),
 * whose rules the prompts are built from.
 */
export enum ArtStyle {
  Guofeng2D = '2D_chinese_guofeng',
  Traditional3D = '3D_chinese_traditional',
  AncientReal = 'realpeople_ancient_chinese',
  ModernReal = 'realpeople_modern_city',
}

/** One style's fixed prompt material. The anchor opens a prompt and the closing tag and quality lock end it — that order is the style's, not the caller's. */
export interface ArtStyleRules {
  key: ArtStyle;
  label: string;
  /** Names the files drawn in this style, e.g. `guofeng2d`. */
  tag: string;
  /** The opening phrase every prompt in this style starts with. */
  anchor: string;
  /** Added whenever a character is visible. */
  characterTexture: string;
  /** The phrase every prompt closes on, before the quality lock. */
  closingTag: string;
  qualityLock: string;
  /** What this style must never be asked for. */
  avoid: string;
  /** The head-to-body ratio a sheet in this style is drawn to. */
  sheetProportion: string;
  /** The plain backdrop every sheet in this style stands against. */
  sheetBackdrop: string;
  /** What the base look wears — plain clothing that later outfits replace, in this style's own period. */
  sheetBaseClothing: string;
}

export const ART_STYLES: ArtStyleRules[] = [
  {
    key: ArtStyle.Guofeng2D,
    label: 'Guofeng 2D · cel-shaded anime',
    tag: 'guofeng2d',
    anchor: '国风二次元，新国潮美学，日式动画渲染，赛璐璐平涂，细腻笔触',
    characterTexture: '二次元国风造型，线条清晰，赛璐璐上色，服饰细节精致，光影层次丰富',
    closingTag: '国风二次元电影质感，东方古韵，新国潮风格，日式动画渲染技法',
    qualityLock: '国风二次元高清渲染，高细节，细腻线条，赛璐璐平涂感，电影质感，画面无字幕、无水印、无标题叠字',
    avoid: 'photorealism, 3D/CG/PBR rendering, other animation styles, subtitles, watermarks, title overlays, any text',
    sheetProportion: '6-7 heads tall proportion，二次元古典比例',
    sheetBackdrop: '月白纯色背景 #E8EAF5',
    sheetBaseClothing: '素色古装打底服装（女性素色长裙，男性素色长衫），基础色，无花纹装饰，除面部、颈部与手部外基本覆盖',
  },
  {
    key: ArtStyle.Traditional3D,
    label: 'Chinese traditional 3D · cinematic',
    tag: 'traditional3d',
    anchor: '国风3D渲染，高精度建模，PBR材质，电影级光影',
    characterTexture: '国风3D角色造型，高精度材质细节，清晰发丝与服饰纹理，层次丰富的电影光影',
    closingTag: '国风3D电影质感，东方古韵，写实材质与精细建模',
    qualityLock: '高精度3D渲染，高细节，PBR材质，清晰主体，电影质感，画面无字幕、无水印、无标题叠字',
    avoid: '2D line art, cel shading, live-action photography claims, game UI, watermarks, title overlays, any text',
    sheetProportion: '7 heads tall proportion，古典比例',
    sheetBackdrop: '素灰纯色背景 #B8B8B8',
    sheetBaseClothing: '素色古装打底服装（女性素色长裙，男性素色长衫），基础色，无花纹装饰，除面部、颈部与手部外基本覆盖',
  },
  {
    key: ArtStyle.AncientReal,
    label: 'Ancient Chinese · photoreal',
    tag: 'ancientreal',
    anchor: '真人写实摄影，古风写实纪实，自然光照，物理光影，极致细节',
    characterTexture: '自然皮肤纹理与微可见毛孔，真实发丝，中国传统低饱和服装材质',
    closingTag: '古风真人电影摄影质感，东方古韵，自然光影',
    qualityLock: '真人写实高清摄影，高细节，真实皮肤与织物质感，清晰主体，电影质感，画面无字幕、无水印、无标题叠字',
    avoid: '2D/anime, 3D/CG/PBR, modern urban clothing or props, plastic skin, watermarks, title overlays, any text',
    sheetProportion: '7-8 heads tall proportion，比例匀称，头身比协调',
    sheetBackdrop: '纯净中性灰背景 #E8E8E8',
    sheetBaseClothing: '角色身份对应的素色古装常服（女性素色长裙，男性素色长衫），中国传统低饱和色，无复杂花纹，除面部、颈部与手部外基本覆盖',
  },
  {
    key: ArtStyle.ModernReal,
    label: 'Modern city · photoreal',
    tag: 'modernreal',
    anchor: '真人实拍摄影，当代都市纪实感，35mm全画幅摄影质感，自然光与真实环境细节',
    characterTexture: '真实亚洲人物，自然皮肤纹理与可见毛孔，自然发丝与日常穿着褶皱',
    closingTag: '当代都市真人电影摄影质感，真实色彩与自然光影',
    qualityLock: '真人写实高清摄影，高细节，清晰主体，真实皮肤与材质，电影质感，画面无字幕、无水印、无标题叠字',
    avoid: '2D/anime, 3D/CG/PBR, beauty-filtered plastic skin, period costume or historical props, watermarks, title overlays, any text',
    sheetProportion: '真实亚洲人物身体比例，自然头身比（约7头身），不拉长腿部',
    sheetBackdrop: '中灰无缝背景纸 #B0B0B0，背景纸轻微肌理可见',
    sheetBaseClothing: '素色基础款上衣与基础款下装，面料真实纹理可见，自然穿着褶皱，无logo、无印花、无装饰',
  },
];

export const DEFAULT_ART_STYLE = ArtStyle.Guofeng2D;

export function isArtStyle(style: string): boolean {
  return ART_STYLES.some((rules) => rules.key === style);
}

export function artStyleOf(style: ArtStyle): ArtStyleRules {
  return ART_STYLES.find((rules) => rules.key === style) ?? ART_STYLES[0];
}

/** The slug the base look is filed under, where an outfit uses its own. */
export const BASE_LOOK_SLUG = 'base';

/** One character's base look or one of its outfits, e.g. `sera.base.guofeng2d.png`. */
export function characterImageFile(characterSlug: string, outfitSlug: string, style: ArtStyle): string {
  return `${characterSlug}.${outfitSlug}.${artStyleOf(style).tag}.png`;
}

/** One frame of a chapter, e.g. `frame-01.guofeng2d.png`. */
export function frameImageFile(frameIdx: number, style: ArtStyle): string {
  return `frame-${String(frameIdx).padStart(2, '0')}.${artStyleOf(style).tag}.png`;
}

/** One unique outfit of a character — the same wording across scenes is one outfit. */
export interface CharacterOutfitDesign {
  /** Names the outfit's image file, unique within the character and stable across rebuilds. */
  slug: string;
  /** The outfit as `world.json` words it — what the prompt is written from. */
  original: string;
  /** The outfit as `world.vi.json` renders it. */
  translated: string;
  /** The `chapterXXXX-timelineYYYY` scenes that wear it, earliest first — the first of them is when it is first worn. */
  scenes: string[];
  prompt: string;
}

/** One character of the novel, designed once: the body it always has, and every outfit it is ever in. */
export interface CharacterDesign {
  slug: string;
  name: string;
  nameOriginal: string;
  weight: CharacterWeight;
  /** Body, face and features as `world.json` words them. */
  bodyOriginal: string;
  body: string;
  /** How many scenes the character appears in. */
  sceneCount: number;
  /** The chapter the character first appears in — what orders the rail. 0 when the metadata never places them in a scene. */
  firstChapter: number;
  /** Art style + base look — the prompt the base image is drawn from. */
  basePrompt: string;
  outfits: CharacterOutfitDesign[];
}

/** `design.json` in full — every character's look, built from the world translation. */
export interface IllustrationDesign {
  /** The style the prompts were written for; rebuilding after a style change rewrites them. */
  style: ArtStyle;
  characters: CharacterDesign[];
}

/** One frame of a chapter: a stretch of its narration, and the moment drawn over it. */
export interface IllustrationFrame {
  idx: number;
  /** Where the frame starts and ends in the narration, seconds. */
  start: number;
  end: number;
  /** The .srt cues it covers, both ends inclusive. */
  fromCue: number;
  toCue: number;
  /** The scene it sits in — the chapter's own timeline context. */
  scene: string;
  /** The characters visible, each as `name · outfit`. */
  cast: string[];
  /** The character images the frame is drawn against, by file name, so the cast keeps the look it was designed with. */
  refs: string[];
  moment: string;
  prompt: string;
}

/** One chapter's `frames.json` in full. */
export interface ChapterFramePlan {
  /** `chapterXXXX`, the chapter's own number zero-padded. */
  chapterIdx: string;
  style: ArtStyle;
  frames: IllustrationFrame[];
}

/** One of the novel's chapters and how far illustration has got with it. */
export interface WorkspaceIllustrationChapter {
  idx: number;
  title: string;
  /** Whether the chapter has narration — frames are cut against its .srt, so audio comes first. */
  narrated: boolean;
  frameCount: number;
  drawnCount: number;
}

/** The design as the step's screen reads it, with what has been drawn from it. */
export interface WorkspaceIllustrationState {
  /** Null until the design has been built from the metadata. */
  design: IllustrationDesign | null;
  /** Whether `world.vi.json` exists — nothing can be designed before it. */
  hasMetadata: boolean;
  style: ArtStyle;
  /** Every character image drawn in the current style, its file name to the URL the renderer loads it from. */
  images: Record<string, string>;
  /** When `design.json` was last written, epoch ms, or null when there is none. */
  updatedAt: number | null;
  chapters: WorkspaceIllustrationChapter[];
  /** What frame planning will call, or null until the workspace has picked an engine and model. */
  llm: LlmSettings | null;
}

/** One chapter as the screen's frames tab shows it: the plan, and the images drawn from it. */
export interface WorkspaceChapterFrames {
  idx: number;
  title: string;
  /** Null until the chapter's frames have been planned. */
  plan: ChapterFramePlan | null;
  /** How long the chapter's narration runs, seconds — 0 when it has none. */
  duration: number;
  images: Record<string, string>;
}

export const APP_WORKSPACE_ILLUSTRATION_IPC_CHANNELS = {
  read: 'app-workspace-illustration:read',
  setStyle: 'app-workspace-illustration:set-style',
  saveDesign: 'app-workspace-illustration:save-design',
  rebuildDesign: 'app-workspace-illustration:rebuild-design',
  readChapter: 'app-workspace-illustration:read-chapter',
  saveFrames: 'app-workspace-illustration:save-frames',
  planFrames: 'app-workspace-illustration:plan-frames',
  drawCharacter: 'app-workspace-illustration:draw-character',
  drawFrame: 'app-workspace-illustration:draw-frame',
} as const;

export interface AppWorkspaceIllustrationApi {
  /** One workspace's `design.json`, as it stands on disk, with what has been drawn from it. */
  read(workspaceId: string): Promise<WorkspaceIllustrationState>;
  /** Stores the workspace's art style — what every later image is drawn in, and what scopes the files. */
  setStyle(workspaceId: string, style: ArtStyle): Promise<WorkspaceIllustrationState>;
  /** Overwrites `design.json` with the edited design. Nothing is redrawn. */
  saveDesign(workspaceId: string, design: IllustrationDesign): Promise<WorkspaceIllustrationState>;
  /** Rebuilds the design from `world.vi.json` in plain code, discarding hand-edited prompts. */
  rebuildDesign(workspaceId: string): Promise<WorkspaceIllustrationState>;
  readChapter(workspaceId: string, chapterNo: number): Promise<WorkspaceChapterFrames>;
  /** Overwrites a chapter's `frames.json` with the edited plan. Nothing is redrawn. */
  saveFrames(workspaceId: string, chapterNo: number, plan: ChapterFramePlan): Promise<WorkspaceChapterFrames>;
  /** Asks the LLM to cut the chapter into frames along its scenes and .srt cues, replacing whatever plan it had. */
  planFrames(workspaceId: string, chapterNo: number): Promise<WorkspaceChapterFrames>;
  /** Draws one character image from its saved prompt — the base look when `outfitSlug` is `BASE_LOOK_SLUG`. */
  drawCharacter(workspaceId: string, characterSlug: string, outfitSlug: string): Promise<WorkspaceIllustrationState>;
  /** Draws one frame of a chapter from its saved prompt, against the character images it names. */
  drawFrame(workspaceId: string, chapterNo: number, frameIdx: number): Promise<WorkspaceChapterFrames>;
}
