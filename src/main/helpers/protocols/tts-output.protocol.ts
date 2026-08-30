import { protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TTS_OUTPUT_PROTOCOL } from '../../../shared/app-workflow-activity';
import { getAppWorkflowExportDir } from '../paths';

// Must run before the app is ready, so Chromium treats the scheme as standard and fetchable.
protocol.registerSchemesAsPrivileged([{ scheme: TTS_OUTPUT_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** `Range: bytes=<start>-<end>`, both ends optional — see RFC 7233. */
function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : size - Number(match[2]);
  const end = match[2] && match[1] ? Number(match[2]) : size - 1;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Serves a workflow's generated per-chapter narration wav files (see `../workflow-tts`) to the
 * renderer's `<audio>` players. Reads the file directly rather than `net.fetch`-ing its `file://` URL
 * — same reasoning as the voice-sample protocol: Chromium's `<audio>` pipeline needs a real
 * Content-Length and honors `Range` requests while scrubbing. Only usable after `app` is ready.
 */
export function registerTtsOutputProtocolHandler(): void {
  protocol.handle(TTS_OUTPUT_PROTOCOL, async (request) => {
    // Chromium collapses a host-less URL's path into the host, so these URLs use a throwaway host and keep `/<workflowId>/<language>/<file>` in the path.
    const [workflowId, language, fileName] = decodeURIComponent(new URL(request.url).pathname).split('/').filter(Boolean);
    const body = await fs.readFile(path.join(getAppWorkflowExportDir(workflowId), 'audios', language, 'chapters', fileName));

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
