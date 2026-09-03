import { parseSrt, type SrtCue } from '@/shared/app-workspace-narration';
import { plainSlug } from '@/shared/text';

/**
 * The introduction of the app read in every preset voice at pace 1.0, generated
 * once with `speech.py` and shipped beside this file — `<voice slug>.mp3` and its
 * `.srt`. Bundled as URLs so nothing has to be fetched from the main process.
 */
const AUDIO = import.meta.glob('./preview/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const SRT = import.meta.glob('./preview/*.srt', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

export interface VoicePreview {
  url: string;
  cues: SrtCue[];
}

function entryOf<T>(files: Record<string, T>, voice: string, ext: string): T | undefined {
  return files[`./preview/${plainSlug(voice)}${ext}`];
}

/** The preview of one voice, or undefined when none was generated for it. */
export function previewOf(voice: string): VoicePreview | undefined {
  const url = entryOf(AUDIO, voice, '.mp3');
  if (!url) return undefined;
  return { url, cues: parseSrt(entryOf(SRT, voice, '.srt') ?? '') };
}
