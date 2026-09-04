import { logger } from '@/main/helpers/logger';
import { runLlmJson } from '@/main/helpers/llm-cli';
import { chapterIdxOf, readChapterExtraction } from '@/main/queue/handlers/audio-novel/semantic-analysis';
import { readChapterCues } from '@/main/queue/handlers/audio-novel/narration-speech';
import { readChapterTranslation } from '@/main/queue/handlers/audio-novel/semantic-translate';
import type { AppWorkspace } from '@/shared/app-workspace';
import type { ChapterExtraction, ChapterTimeline } from '@/shared/app-workspace-extraction';
import type { ChapterTranslation } from '@/shared/app-workspace-translation';
import { BASE_LOOK_SLUG, characterImageFile, type ArtStyle, type CharacterDesign, type ChapterFramePlan, type IllustrationDesign, type IllustrationFrame } from '@/shared/app-workspace-illustration';
import type { SrtCue } from '@/shared/app-workspace-narration';
import type { LlmSettings } from '@/shared/llm';
import { framePromptOf } from './prompt';
import { writeFramePlan } from './store';

/** One frame as the model returns it — the cue span it covers, the scene it is in, and what is visible. */
export interface PlannedFrame {
  fromCue: number;
  toCue: number;
  timelineIdx: string;
  cast: string[];
  moment: string;
}

interface PlannedFrames {
  frames: PlannedFrame[];
}

const FRAME_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['frames'],
  properties: {
    frames: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fromCue', 'toCue', 'timelineIdx', 'cast', 'moment'],
        properties: {
          fromCue: { type: 'integer' },
          toCue: { type: 'integer' },
          timelineIdx: { type: 'string' },
          cast: { type: 'array', items: { type: 'string' } },
          moment: { type: 'string' },
        },
      },
    },
  },
};

/** The longest stretch of narration one frame may hold — a still image outstays its welcome well before a minute. */
const MAX_FRAME_SECONDS = 60;

/** The fewest frames the chapter can be cut into without one of them outrunning `MAX_FRAME_SECONDS`. */
function frameFloorOf(cues: SrtCue[]): number {
  return Math.max(1, Math.ceil(cues[cues.length - 1].end / MAX_FRAME_SECONDS));
}

function buildFramePlanPrompt(extraction: ChapterExtraction, cues: SrtCue[], floor: number): string {
  const scenes = extraction.timelines.map((timeline) => ({ idx: timeline.idx, context: timeline.context, summary: timeline.summary, participants: timeline.participants }));
  const lines = cues.map((cue) => `${cue.idx}. [${Math.round(cue.start)}s] ${cue.text}`).join('\n');

  return `You are cutting one chapter of a narrated novel into illustration frames. Each frame is one still image laid over a continuous stretch of the narration.

Rules:
- No frame may cover more than ${MAX_FRAME_SECONDS} seconds of narration. That means at least ${floor} frames for this chapter; cut more finely wherever the scene changes or the action moves on.
- The frames must cover cue 1 to cue ${cues.length} with no gap and no overlap, in order. A frame never spans two scenes: cut at the cue where the scene changes.
- "timelineIdx" is the scene the frame sits in, echoed exactly from the scenes below.
- "cast" is the characters actually visible in that frame, named exactly as the scene participants name them. Leave it empty for a frame with no one in it.
- "moment" is one sentence, in the same language as the scenes below, describing only what is visible: subject, action, expression, setting and light. No inner thoughts, no plot explanation, no camera or style words.
- Return only the JSON object.

Scenes of the chapter, in order:
${JSON.stringify(scenes, null, 2)}

The narration, one line per cue — these are the timings the frames are cut against:
${lines}`;
}

/**
 * The frames the model returned, made to cover the chapter exactly once: sorted,
 * made contiguous from the first cue to the last, and renumbered. A model that
 * leaves a gap or overlaps two frames is corrected rather than rejected, since
 * only the cut points are its judgement — the coverage is the app's rule.
 */
export function contiguousFrames(planned: PlannedFrame[], cueCount: number): PlannedFrame[] {
  const sorted = [...planned].sort((left, right) => left.fromCue - right.fromCue).slice(0, cueCount);
  const frames: PlannedFrame[] = [];

  for (const frame of sorted) {
    const fromCue = frames.length === 0 ? 1 : frames[frames.length - 1].toCue + 1;
    if (fromCue > cueCount) break;
    frames.push({ ...frame, fromCue, toCue: Math.min(Math.max(frame.toCue, fromCue), cueCount) });
  }

  if (frames.length === 0) return [{ fromCue: 1, toCue: cueCount, timelineIdx: '', cast: [], moment: '' }];
  frames[frames.length - 1].toCue = cueCount;
  return frames;
}

/**
 * Cuts any frame that runs past `MAX_FRAME_SECONDS` into parts that do not, at
 * the cue boundaries inside it. The prompt asks for this too, so it rarely has
 * anything to do — but a part cut here inherits the moment of the frame it came
 * from, since only the model can say what a new part shows. A single cue longer
 * than the cap is left whole: it is the smallest thing there is to cut at.
 */
export function shortFrames(frames: PlannedFrame[], cues: SrtCue[]): PlannedFrame[] {
  const cut: PlannedFrame[] = [];

  for (const frame of frames) {
    let fromCue = frame.fromCue;
    while (fromCue <= frame.toCue) {
      const start = cues[fromCue - 1].start;
      let toCue = fromCue;
      while (toCue < frame.toCue && cues[toCue].end - start <= MAX_FRAME_SECONDS) toCue += 1;
      cut.push({ ...frame, fromCue, toCue });
      fromCue = toCue + 1;
    }
  }

  return cut;
}

/** The character the model meant, matched on the name in either language. */
function characterOf(design: IllustrationDesign, name: string): CharacterDesign | undefined {
  return design.characters.find((character) => character.nameOriginal === name || character.name === name);
}

/** The scene's own outfit for a character, or the last one they were dressed in before it — the outfits run in the order they are first worn. */
function outfitOf(character: CharacterDesign, sceneKey: string) {
  const earlier = character.outfits.filter((outfit) => outfit.scenes[0] <= sceneKey);
  return character.outfits.find((outfit) => outfit.scenes.includes(sceneKey)) ?? earlier[earlier.length - 1] ?? character.outfits[0];
}

/**
 * What the cast means for one frame: how it reads on screen, how it reads in the
 * prompt, and which character images it should be drawn against. A reference is
 * named whether or not it has been drawn yet — that is what tells a later run
 * which looks this frame is still waiting on.
 */
function castOf(names: string[], design: IllustrationDesign, sceneKey: string, style: ArtStyle) {
  const cast: string[] = [];
  const described: string[] = [];
  const refs: string[] = [];

  for (const name of names) {
    const character = characterOf(design, name);
    if (!character) {
      cast.push(name);
      described.push(name);
      continue;
    }
    const outfit = outfitOf(character, sceneKey);
    cast.push(`${character.name || character.nameOriginal} · ${outfit?.translated ?? 'base look'}`);
    described.push(`${character.nameOriginal}: ${outfit?.original ?? character.bodyOriginal}`);
    refs.push(characterImageFile(character.slug, outfit?.slug ?? BASE_LOOK_SLUG, style));
  }

  return { cast, described, refs };
}

/** The scene as the screen names it — the translated context when there is one, the original otherwise. */
function sceneLabelOf(timeline: ChapterTimeline | undefined, translation: ChapterTranslation | undefined): string {
  if (!timeline) return '';
  const translated = translation?.timelines.find((candidate) => candidate.idx === timeline.idx)?.context;
  return translated || timeline.context;
}

interface FramePlanContext {
  workspace: AppWorkspace;
  design: IllustrationDesign;
  extraction: ChapterExtraction;
  translation: ChapterTranslation | undefined;
  cues: SrtCue[];
}

function frameOf(planned: PlannedFrame, position: number, context: FramePlanContext): IllustrationFrame {
  const { workspace, design, extraction, translation, cues } = context;
  const style = workspace.artStyle;
  const timeline = extraction.timelines.find((candidate) => candidate.idx === planned.timelineIdx);
  const sceneKey = `${extraction.chapterIdx}-${planned.timelineIdx}`;
  const { cast, described, refs } = castOf(planned.cast, design, sceneKey, style);

  return {
    idx: position,
    start: cues[planned.fromCue - 1].start,
    end: cues[planned.toCue - 1].end,
    fromCue: planned.fromCue,
    toCue: planned.toCue,
    scene: sceneLabelOf(timeline, translation),
    cast,
    refs,
    moment: planned.moment,
    prompt: framePromptOf(style, timeline?.context ?? '', described, planned.moment),
  };
}

/**
 * Cuts one chapter into frames and writes `frames.json`, replacing whatever plan
 * it had. The model only decides where the cuts fall and what is visible; the
 * timings come from the chapter's own .srt and every prompt is built in code from
 * the art style and the design's outfit for that scene, so a frame is never drawn
 * against a look the characters were not designed with. No frame outruns
 * `MAX_FRAME_SECONDS`, whether or not the model kept to it.
 */
export async function planChapterFrames(workspace: AppWorkspace, chapterNo: number, design: IllustrationDesign, llm: LlmSettings): Promise<ChapterFramePlan> {
  const cues = readChapterCues(workspace, chapterNo);
  if (cues.length === 0) throw new Error(`Chapter ${chapterNo} has no narration yet — frames are cut against its .srt, so it has to be narrated first.`);

  const extraction = readChapterExtraction(workspace.name, chapterNo);
  if (!extraction) throw new Error(`Chapter ${chapterNo} has not been extracted — run Semantic Analysis over it first.`);

  const prompt = buildFramePlanPrompt(extraction, cues, frameFloorOf(cues));
  const answer = (await runLlmJson(prompt, FRAME_PLAN_SCHEMA, llm)) as PlannedFrames;

  const context: FramePlanContext = { workspace, design, extraction, translation: readChapterTranslation(workspace.name, chapterNo), cues };
  const planned = shortFrames(contiguousFrames(answer.frames ?? [], cues.length), cues);
  const frames = planned.map((frame, position) => frameOf(frame, position + 1, context));

  const plan: ChapterFramePlan = { chapterIdx: chapterIdxOf(chapterNo), style: workspace.artStyle, frames };
  writeFramePlan(workspace.name, chapterNo, plan);
  logger.info(`[illustration] chapter ${chapterNo} cut into ${frames.length} frame(s)`);
  return plan;
}
