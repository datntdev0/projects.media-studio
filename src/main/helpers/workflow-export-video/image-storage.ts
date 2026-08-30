import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EXPORT_VIDEO_IMAGE_PROTOCOL } from '../../../shared/app-workflow-activity';
import { getAppWorkflowExportDir } from '../paths';

/** Extensions export-video images are written with, keyed by the content type they were uploaded as. */
const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Where a workflow's uploaded export-video source images live — keyed by a random file name rather than the owning activity's id, since an activity picked on the canvas has no id yet until the workflow is saved. */
export function exportVideoImagesDir(workflowId: string): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'exports', 'images');
}

/** Writes an uploaded image into the workflow's working directory and returns the `app-export-video-image://` URL its `imageFile` config can be set to. */
export function writeExportVideoImage(workflowId: string, fileName: string, contentType: string, data: Buffer): string {
  const extension = IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType] || path.extname(fileName).replace('.', '') || 'jpg';
  const dir = exportVideoImagesDir(workflowId);
  fs.mkdirSync(dir, { recursive: true });
  const savedName = `${randomUUID()}.${extension}`;
  fs.writeFileSync(path.join(dir, savedName), data);
  return `${EXPORT_VIDEO_IMAGE_PROTOCOL}://image/${encodeURIComponent(workflowId)}/${encodeURIComponent(savedName)}`;
}

/** Resolves an `app-export-video-image://` URL back to the real file it was written to, or `null` for anything else (e.g. no image picked yet). */
export function resolveExportVideoImagePath(imageFile: string | null): string | null {
  if (!imageFile || !imageFile.startsWith(`${EXPORT_VIDEO_IMAGE_PROTOCOL}://`)) return null;
  const [workflowId, fileName] = decodeURIComponent(new URL(imageFile).pathname).split('/').filter(Boolean);
  return path.join(exportVideoImagesDir(workflowId), fileName);
}
