import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEECH, cueAt, formatClock, isSpeechSettings, parseSrt } from './app-workspace-narration';

const SRT = '1\n00:00:00,000 --> 00:00:02,500\nChuyến phà đêm\n\n2\n00:00:02,800 --> 00:01:05,120\nBến cảng giữ những quyển sổ của nó.\n\n3\n01:00:00,000 --> 01:00:01,000\nCuối.\n';

describe('parseSrt', () => {
  it('reads one cue per block with its times in seconds', () => {
    expect(parseSrt(SRT)).toEqual([
      { idx: 1, start: 0, end: 2.5, text: 'Chuyến phà đêm' },
      { idx: 2, start: 2.8, end: 65.12, text: 'Bến cảng giữ những quyển sổ của nó.' },
      { idx: 3, start: 3600, end: 3601, text: 'Cuối.' },
    ]);
  });

  it('accepts Windows line endings and an empty file', () => {
    expect(parseSrt(SRT.replace(/\n/g, '\r\n'))).toHaveLength(3);
    expect(parseSrt('')).toEqual([]);
  });
});

describe('cueAt', () => {
  const cues = parseSrt(SRT);

  it('is the last cue that has started, including the gap after it', () => {
    expect(cueAt(cues, 1)?.idx).toBe(1);
    expect(cueAt(cues, 2.6)?.idx).toBe(1);
    expect(cueAt(cues, 70)?.idx).toBe(2);
  });

  it('is nothing before the first cue', () => {
    expect(cueAt([{ idx: 1, start: 1, end: 2, text: 'x' }], 0.5)).toBeUndefined();
  });
});

describe('formatClock', () => {
  it('reads m:ss, and h:mm:ss once there is an hour', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('isSpeechSettings', () => {
  it('accepts the defaults and refuses a voice or pace the step does not offer', () => {
    expect(isSpeechSettings(DEFAULT_SPEECH)).toBe(true);
    expect(isSpeechSettings({ voice: 'Nobody', pace: 1.0 })).toBe(false);
    expect(isSpeechSettings({ voice: DEFAULT_SPEECH.voice, pace: 1.5 })).toBe(false);
  });
});
