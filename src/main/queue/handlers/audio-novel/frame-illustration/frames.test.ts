import { describe, expect, it } from 'vitest';
import type { SrtCue } from '@/shared/app-workspace-narration';
import { contiguousFrames, shortFrames, type PlannedFrame } from './frames';

/** Cues of `seconds` each, back to back — the timeline the cuts are measured against. */
function cuesOf(count: number, seconds: number): SrtCue[] {
  return Array.from({ length: count }, (_unused, offset) => ({ idx: offset + 1, start: offset * seconds, end: (offset + 1) * seconds, text: `line ${offset + 1}` }));
}

function frameOf(fromCue: number, toCue: number, moment = 'a moment'): PlannedFrame {
  return { fromCue, toCue, timelineIdx: 'timeline0001', cast: [], moment };
}

/** The seconds each frame holds, which is what the cap is about. */
function spansOf(frames: PlannedFrame[], cues: SrtCue[]): number[] {
  return frames.map((frame) => cues[frame.toCue - 1].end - cues[frame.fromCue - 1].start);
}

describe('contiguousFrames', () => {
  it('covers every cue exactly once, closing the gaps and overlaps the model left', () => {
    const frames = contiguousFrames([frameOf(1, 4), frameOf(7, 9), frameOf(3, 6)], 12);

    expect(frames.map((frame) => [frame.fromCue, frame.toCue])).toEqual([[1, 4], [5, 6], [7, 12]]);
  });

  it('covers the chapter with one frame when the model returned none', () => {
    expect(contiguousFrames([], 8)).toEqual([{ fromCue: 1, toCue: 8, timelineIdx: '', cast: [], moment: '' }]);
  });

  it('drops the frames that run past the last cue, and stretches the last one to it', () => {
    const frames = contiguousFrames([frameOf(1, 3), frameOf(4, 5), frameOf(6, 40)], 5);

    expect(frames.map((frame) => [frame.fromCue, frame.toCue])).toEqual([[1, 3], [4, 5]]);
  });
});

describe('shortFrames', () => {
  it('cuts a frame that outruns a minute into parts that do not', () => {
    // 30 cues of 8s — one frame over all of them runs four minutes.
    const cues = cuesOf(30, 8);
    const frames = shortFrames([frameOf(1, 30)], cues);

    expect(spansOf(frames, cues).every((span) => span <= 60)).toBe(true);
    expect(frames.map((frame) => [frame.fromCue, frame.toCue])).toEqual([[1, 7], [8, 14], [15, 21], [22, 28], [29, 30]]);
  });

  it('leaves a frame already inside the cap alone, and keeps the coverage contiguous', () => {
    const cues = cuesOf(20, 10);
    const frames = shortFrames([frameOf(1, 5), frameOf(6, 20)], cues);

    expect(frames[0]).toEqual(frameOf(1, 5));
    expect(frames[0].fromCue).toBe(1);
    expect(frames[frames.length - 1].toCue).toBe(20);
    frames.reduce((previous, frame) => {
      expect(frame.fromCue).toBe(previous + 1);
      return frame.toCue;
    }, 0);
  });

  it('keeps a single cue whole even when it is longer than the cap, since there is nothing to cut at', () => {
    const cues = cuesOf(2, 90);

    expect(shortFrames([frameOf(1, 2)], cues).map((frame) => [frame.fromCue, frame.toCue])).toEqual([[1, 1], [2, 2]]);
  });

  it('carries the frame it came from onto every part, since only the model can say what a new part shows', () => {
    const cues = cuesOf(10, 20);
    const frames = shortFrames([frameOf(1, 10, 'she counts the masts')], cues);

    expect(frames.length).toBeGreaterThan(1);
    expect(frames.every((frame) => frame.moment === 'she counts the masts')).toBe(true);
  });
});
