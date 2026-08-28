import fs from 'node:fs';
import path from 'node:path';
import { getAppWorkflowExportDir } from '../paths';
import { chapterId, loadPackagedContents } from '../workflow-pipeline';
import { AppLibraryContentType, type ContentLanguage } from '../../../shared/app-library-content';
import type { PipelineOutputPage, TranslateOutput, TranslateOutputChapter } from '../../../shared/app-workflow-activity';

const CHAPTER_ID_RE = /^chapter-\d{4}$/;

function languageDir(workflowId: string, language: ContentLanguage): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'translation', language);
}

function chapterTitleFile(languageDirPath: string, idx: number): string {
  return path.join(languageDirPath, 'chapters', `${chapterId(idx)}.title.txt`);
}

function wordCount(body: string): number {
  const trimmed = body.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Chapter indices already translated under a translate run's `chapters/` subdirectory, sorted ascending. */
function listChapterIndices(dir: string): number[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .map((file) => /^chapter-(\d{4})\.txt$/.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

/** Reads a Translate activity's already-produced output — translated chapter counts for `language` — or `null` if it hasn't translated anything yet. */
export function readTranslateOutput(workflowId: string, language: ContentLanguage): TranslateOutput | null {
  const dir = languageDir(workflowId, language);
  const chaptersTranslated = listChapterIndices(path.join(dir, 'chapters')).length;
  const glossaryTranslated = fs.existsSync(path.join(dir, 'glossary.md'));
  if (chaptersTranslated === 0 && !glossaryTranslated) {
    return null;
  }

  const workflowDir = getAppWorkflowExportDir(workflowId);
  const contentsPath = path.join(workflowDir, 'contents.json');
  const totalChapters = fs.existsSync(contentsPath) ? loadPackagedContents(workflowDir).filter((record) => record.type === AppLibraryContentType.Original && record.file).length : 0;

  return { language, totalChapters, glossaryTranslated, chaptersTranslated };
}

/** One page of a translate run's translated chapters, for the Output tab's lazy-loaded Translated Chapters section. */
export function readTranslateChapters(workflowId: string, language: ContentLanguage, offset: number, limit: number): PipelineOutputPage<TranslateOutputChapter> {
  const dir = languageDir(workflowId, language);
  const chaptersDir = path.join(dir, 'chapters');
  const indices = listChapterIndices(chaptersDir);

  const workflowDir = getAppWorkflowExportDir(workflowId);
  const titleByIdx = new Map<number, string>();
  const contentsPath = path.join(workflowDir, 'contents.json');
  if (fs.existsSync(contentsPath)) {
    for (const record of loadPackagedContents(workflowDir)) {
      titleByIdx.set(record.idx, record.title);
    }
  }

  const items = indices.slice(offset, offset + limit).map((idx) => {
    const text = fs.readFileSync(path.join(chaptersDir, `${chapterId(idx)}.txt`), 'utf8');
    const titleFile = chapterTitleFile(dir, idx);
    const title = fs.existsSync(titleFile) ? fs.readFileSync(titleFile, 'utf8').trim() : titleByIdx.get(idx) || `Chapter ${idx}`;
    return { chapterId: chapterId(idx), idx, title, wordCount: wordCount(text) };
  });

  return { items, total: indices.length };
}

/** One chapter's full translated text, read on demand when its Output tab row is expanded. `null` if it hasn't been translated, or `id` isn't a well-formed chapter id. */
export function readTranslateChapterText(workflowId: string, language: ContentLanguage, id: string): string | null {
  if (!CHAPTER_ID_RE.test(id)) {
    return null;
  }
  const filePath = path.join(languageDir(workflowId, language), 'chapters', `${id}.txt`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}
