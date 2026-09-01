import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { COVER_PROTOCOL, getAppCoverDir } from '@/main/helpers/paths';

// Must run before the app is ready, so Chromium treats the scheme as standard and fetchable.
protocol.registerSchemesAsPrivileged([{ scheme: COVER_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/** Serves cover images cached under `getCoverCacheDir()` to the renderer. Only usable after `app` is ready. */
export function registerCoverProtocolHandler(): void {
  protocol.handle(COVER_PROTOCOL, (request) => {
    // Chromium collapses a host-less URL's path into the host, so covers use a throwaway host and keep the file name in the path.
    const fileName = path.basename(decodeURIComponent(new URL(request.url).pathname));
    return net.fetch(pathToFileURL(path.join(getAppCoverDir(), fileName)).toString());
  });
}
