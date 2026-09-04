import fs from 'node:fs';
import path from 'node:path';
import { chapterFileStem } from '@/main/helpers/chapter-files';
import { fileWrittenAt, readJsonFile, writeJsonFile } from '@/main/helpers/json-file';
import { getAppWorkspaceIllustrationDir, illustrationFileUrl } from '@/main/helpers/paths';
import type { ChapterFramePlan, IllustrationDesign } from '@/shared/app-workspace-illustration';

const DESIGN_FILE = 'design.json';
/** The two folders under a workspace illustrations dir, which the image paths are also written against. */
export const CHARACTERS_DIR = 'characters';
export const FRAMES_DIR = 'frames';
const FRAME_PLAN_FILE = 'frames.json';

function designFile(workspaceName: string): string {
  return path.join(getAppWorkspaceIllustrationDir(workspaceName), DESIGN_FILE);
}

/** Where a chapter's frame plan and its images live — `illustrations/frames/chapter-0388/`. */
function chapterFrameDir(workspaceName: string, chapterNo: number): string {
  return path.join(getAppWorkspaceIllustrationDir(workspaceName), FRAMES_DIR, chapterFileStem(chapterNo));
}

/** The .png files in `dir`, by their bare names — what has been drawn, whatever style it was drawn in. */
function imageNamesOf(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.png')).sort();
}

/** The images of `dir` as the renderer loads them: each file's bare name to its `app-illustration` URL. */
function imageUrlsOf(workspaceName: string, dir: string, segments: string[]): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const name of imageNamesOf(dir)) {
    urls[name] = illustrationFileUrl(workspaceName, [...segments, name]);
  }
  return urls;
}

export function readDesign(workspaceName: string): IllustrationDesign | undefined {
  return readJsonFile<IllustrationDesign>(designFile(workspaceName));
}

export function writeDesign(workspaceName: string, design: IllustrationDesign): void {
  writeJsonFile(designFile(workspaceName), design);
}

export function designWrittenAt(workspaceName: string): number | undefined {
  return fileWrittenAt(designFile(workspaceName));
}

/** One character image by its bare file name — see `characterImageFile` for how that name is built. */
export function characterImagePath(workspaceName: string, fileName: string): string {
  return path.join(getAppWorkspaceIllustrationDir(workspaceName), CHARACTERS_DIR, fileName);
}

export function hasCharacterImage(workspaceName: string, fileName: string): boolean {
  return fs.existsSync(characterImagePath(workspaceName, fileName));
}

export function characterImageUrls(workspaceName: string): Record<string, string> {
  return imageUrlsOf(workspaceName, path.join(getAppWorkspaceIllustrationDir(workspaceName), CHARACTERS_DIR), [CHARACTERS_DIR]);
}

export function readFramePlan(workspaceName: string, chapterNo: number): ChapterFramePlan | undefined {
  return readJsonFile<ChapterFramePlan>(path.join(chapterFrameDir(workspaceName, chapterNo), FRAME_PLAN_FILE));
}

export function writeFramePlan(workspaceName: string, chapterNo: number, plan: ChapterFramePlan): void {
  writeJsonFile(path.join(chapterFrameDir(workspaceName, chapterNo), FRAME_PLAN_FILE), plan);
}

/** One frame image of a chapter by its bare file name — see `frameImageFile`. */
export function frameImagePath(workspaceName: string, chapterNo: number, fileName: string): string {
  return path.join(chapterFrameDir(workspaceName, chapterNo), fileName);
}

export function hasFrameImage(workspaceName: string, chapterNo: number, fileName: string): boolean {
  return fs.existsSync(frameImagePath(workspaceName, chapterNo, fileName));
}

export function frameImageUrls(workspaceName: string, chapterNo: number): Record<string, string> {
  return imageUrlsOf(workspaceName, chapterFrameDir(workspaceName, chapterNo), [FRAMES_DIR, chapterFileStem(chapterNo)]);
}
