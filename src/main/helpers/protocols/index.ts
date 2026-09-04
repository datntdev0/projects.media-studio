import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { COVER_PROTOCOL, ILLUSTRATION_PROTOCOL, NARRATION_PROTOCOL, byteRangeOf, coverFileOf, illustrationFileOf, narrationFileOf } from '@/main/helpers/paths';

// Must run before the app is ready, and only once — a second call replaces the list — so every scheme is declared here.
protocol.registerSchemesAsPrivileged([COVER_PROTOCOL, NARRATION_PROTOCOL, ILLUSTRATION_PROTOCOL].map((scheme) => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } })));

const MEDIA_TYPES: Record<string, string> = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

/**
 * Serves a file with its length stated and a `Range` honoured. `net.fetch` on a
 * file URL gives neither, and an audio element fed a stream of unknown length
 * reports an infinite duration and cannot seek.
 */
function serveFile(file: string, request: Request): Response {
  if (!fs.existsSync(file)) return new Response(null, { status: 404 });

  const size = fs.statSync(file).size;
  const range = byteRangeOf(request.headers.get('range'), size);
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const headers: Record<string, string> = { 'Content-Type': MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' };
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

  const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Serves the app's own files to the renderer, which cannot load a raw file path:
 * cover images cached under the covers directory, and the narration audio and
 * illustrations of a workspace's working directory. Only usable after `app` is ready.
 */
export function registerProtocolHandlers(): void {
  protocol.handle(COVER_PROTOCOL, (request) => serveFile(coverFileOf(request.url), request));
  protocol.handle(NARRATION_PROTOCOL, (request) => serveFile(narrationFileOf(request.url), request));
  protocol.handle(ILLUSTRATION_PROTOCOL, (request) => serveFile(illustrationFileOf(request.url), request));
}
