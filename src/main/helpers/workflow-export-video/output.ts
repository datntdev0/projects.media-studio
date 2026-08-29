import fs from 'node:fs';
import path from 'node:path';
import { getAppWorkflowExportDir } from '../paths';
import { chapterId, loadPackagedContents, type PackagedContentRecord } from '../workflow-pipeline';
import { AppLibraryContentType } from '../../../shared/app-library-content';
import { EXPORT_VIDEO_OUTPUT_PROTOCOL, type ExportVideoConfig, type ExportVideoOutput, type ExportVideoOutputChapter, type PipelineOutputPage } from '../../../shared/app-workflow-activity';

const CHAPTER_ID_RE = /^chapter-\d{4}$/;

export function activityDir(workflowId: string, activityId: string): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'export-video', activityId);
}

export function chaptersDir(workflowId: string, activityId: string): string {
  return path.join(activityDir(workflowId, activityId), 'chapters');
}

export function chapterVideoFile(chaptersDirPath: string, idx: number): string {
  return path.join(chaptersDirPath, `${chapterId(idx)}.mp4`);
}

export function chapterSrtFile(chaptersDirPath: string, idx: number): string {
  return path.join(chaptersDirPath, `${chapterId(idx)}.srt`);
}

export function finalVideoFile(workflowId: string, activityId: string): string {
  return path.join(activityDir(workflowId, activityId), 'final.mp4');
}

export function finalSrtFile(workflowId: string, activityId: string): string {
  return path.join(activityDir(workflowId, activityId), 'final.srt');
}

/** Chapter indices already exported under an export-video run's `chapters/` subdirectory, sorted ascending. */
export function listChapterIndices(dir: string): number[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .map((file) => /^chapter-(\d{4})\.mp4$/.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

/** A chapter's total duration, read back off its srt's last block end timestamp rather than probing the mp4. */
function readDurationSec(srtPath: string): number {
  if (!fs.existsSync(srtPath)) {
    return 0;
  }
  const matches = [...fs.readFileSync(srtPath, 'utf8').matchAll(/--> (\d{2}):(\d{2}):(\d{2}),(\d{3})/g)];
  const last = matches.at(-1);
  if (!last) {
    return 0;
  }
  const [, hours, minutes, seconds, millis] = last;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(millis) / 1000;
}

/** Reads an Export Video activity's already-produced output — exported chapter counts and the final combined video's URL — or `null` if it hasn't exported anything yet. */
export function readExportVideoOutput(workflowId: string, activityId: string, config: ExportVideoConfig): ExportVideoOutput | null {
  const chaptersGenerated = listChapterIndices(chaptersDir(workflowId, activityId)).length;
  if (chaptersGenerated === 0) {
    return null;
  }

  const workflowDir = getAppWorkflowExportDir(workflowId);
  const contentsPath = path.join(workflowDir, 'contents.json');
  const totalChapters = fs.existsSync(contentsPath) ? loadPackagedContents(workflowDir).filter((record) => record.type === AppLibraryContentType.Original && record.file).length : 0;

  const videoUrl = fs.existsSync(finalVideoFile(workflowId, activityId)) ? `${EXPORT_VIDEO_OUTPUT_PROTOCOL}://output/${encodeURIComponent(workflowId)}/${encodeURIComponent(activityId)}/final.mp4` : null;

  return { voice: config.voice, totalChapters, chaptersExported: chaptersGenerated, videoUrl };
}

/** One page of an export-video run's exported per-chapter clips, for the Output tab's lazy-loaded Exported Chapters section. */
export function readExportVideoChapters(workflowId: string, activityId: string, offset: number, limit: number): PipelineOutputPage<ExportVideoOutputChapter> {
  const dir = chaptersDir(workflowId, activityId);
  const indices = listChapterIndices(dir);

  const workflowDir = getAppWorkflowExportDir(workflowId);
  const recordByIdx = new Map<number, PackagedContentRecord>();
  const contentsPath = path.join(workflowDir, 'contents.json');
  if (fs.existsSync(contentsPath)) {
    for (const record of loadPackagedContents(workflowDir)) {
      recordByIdx.set(record.idx, record);
    }
  }

  const items = indices.slice(offset, offset + limit).map((idx) => {
    const record = recordByIdx.get(idx);
    return {
      chapterId: chapterId(idx),
      idx,
      title: record?.title ?? `Chapter ${idx}`,
      durationSec: readDurationSec(path.join(dir, `${chapterId(idx)}.srt`)),
      videoUrl: `${EXPORT_VIDEO_OUTPUT_PROTOCOL}://output/${encodeURIComponent(workflowId)}/${encodeURIComponent(activityId)}/chapters/${chapterId(idx)}.mp4`,
    };
  });

  return { items, total: indices.length };
}

/** One chapter's srt subtitles, read on demand when its Output tab row is expanded. `null` if it hasn't been exported, or `id` isn't a well-formed chapter id. */
export function readExportVideoChapterSrt(workflowId: string, activityId: string, id: string): string | null {
  if (!CHAPTER_ID_RE.test(id)) {
    return null;
  }
  const filePath = path.join(chaptersDir(workflowId, activityId), `${id}.srt`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

/** The final combined video's unified srt, read on demand. `null` until the combine step has run. */
export function readExportVideoSrt(workflowId: string, activityId: string): string | null {
  const filePath = finalSrtFile(workflowId, activityId);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}
