import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { COVER_PROTOCOL, NARRATION_PROTOCOL, coverFileOf, narrationFileOf } from '@/main/helpers/paths';

// Must run before the app is ready, and only once — a second call replaces the list — so every scheme is declared here.
protocol.registerSchemesAsPrivileged([COVER_PROTOCOL, NARRATION_PROTOCOL].map((scheme) => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } })));

function serveFile(file: string): Promise<Response> {
  return net.fetch(pathToFileURL(file).toString());
}

/**
 * Serves the app's own files to the renderer, which cannot load a raw file path:
 * cover images cached under the covers directory, and narration audio from a
 * workspace's working directory. Only usable after `app` is ready.
 */
export function registerProtocolHandlers(): void {
  protocol.handle(COVER_PROTOCOL, (request) => serveFile(coverFileOf(request.url)));
  protocol.handle(NARRATION_PROTOCOL, (request) => serveFile(narrationFileOf(request.url)));
}
