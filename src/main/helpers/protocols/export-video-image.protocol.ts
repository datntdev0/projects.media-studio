import { protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EXPORT_VIDEO_IMAGE_PROTOCOL } from '../../../shared/app-workflow-activity';
import { exportVideoImagesDir } from '../workflow-export-video/image-storage';

const CONTENT_TYPE_BY_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// Must run before the app is ready, so Chromium treats the scheme as standard and fetchable.
protocol.registerSchemesAsPrivileged([{ scheme: EXPORT_VIDEO_IMAGE_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

/**
 * Serves a workflow's uploaded Export Video source image (see `../workflow-export-video/image-storage`)
 * to the renderer's `<img>` preview. Only usable after `app` is ready.
 */
export function registerExportVideoImageProtocolHandler(): void {
  protocol.handle(EXPORT_VIDEO_IMAGE_PROTOCOL, async (request) => {
    // Chromium collapses a host-less URL's path into the host, so these URLs use a throwaway host and keep `/<workflowId>/<fileName>` in the path.
    const [workflowId, fileName] = decodeURIComponent(new URL(request.url).pathname).split('/').filter(Boolean);
    const body = await fs.readFile(path.join(exportVideoImagesDir(workflowId), fileName));
    const contentType = CONTENT_TYPE_BY_EXT[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
    return new Response(body, { headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) } });
  });
}
