import { protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TTS_SAMPLE_PROTOCOL } from '../../../shared/app-workflow-activity';
import { getTtsVoiceSamplesDir } from '../paths';

// Must run before the app is ready, so Chromium treats the scheme as standard and fetchable.
protocol.registerSchemesAsPrivileged([{ scheme: TTS_SAMPLE_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** `Range: bytes=<start>-<end>`, both ends optional — see RFC 7233. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : size - Number(match[2]);
  const end = match[2] && match[1] ? Number(match[2]) : size - 1;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Serves the bundled TTS voice-sample clips (see forge.config.ts's extraResource) to the renderer.
 * Reads the file directly rather than `net.fetch`-ing its `file://` URL, so the response carries a
 * Content-Length — Chromium's `<audio>` pipeline refuses to play a body without one. Only usable
 * after `app` is ready.
 *
 * Chromium's `<audio>` pipeline buffers a wav in chunks via `Range` requests, so a handler that
 * always answers with the whole file from byte 0 — ignoring the requested range — desyncs partway
 * through playback. Honoring `Range` with a real `206` keeps it in sync.
 */
export function registerTtsSampleProtocolHandler(): void {
  protocol.handle(TTS_SAMPLE_PROTOCOL, async (request) => {
    // Chromium collapses a host-less URL's path into the host, so samples use a throwaway host and keep the file name in the path.
    const fileName = path.basename(decodeURIComponent(new URL(request.url).pathname));
    const body = await fs.readFile(path.join(getTtsVoiceSamplesDir(), fileName));

    const range = request.headers.get('Range');
    const parsed = range ? parseRange(range, body.length) : null;
    if (!parsed) {
      return new Response(body, { headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(body.length), 'Accept-Ranges': 'bytes' } });
    }

    const { start, end } = parsed;
    const chunk = body.subarray(start, end + 1);
    return new Response(chunk, {
      status: 206,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${body.length}`,
        'Accept-Ranges': 'bytes',
      },
    });
  });
}
