import fs from 'node:fs';
import path from 'node:path';
import { getAppWorkflowExportDir } from '../paths';
import { chapterId, loadPackagedContents, type PackagedContentRecord } from '../workflow-pipeline';
import { AppLibraryContentType } from '../../../shared/app-library-content';
import { TTS_OUTPUT_PROTOCOL, type PipelineOutputPage, type TtsConfig, type TtsOutput, type TtsOutputChapter } from '../../../shared/app-workflow-activity';

const CHAPTER_ID_RE = /^chapter-\d{4}$/;

function chaptersDir(workflowId: string, config: TtsConfig): string {
  return path.join(getAppWorkflowExportDir(workflowId), 'audios', config.language, 'chapters');
}

function translatedTitleFile(workflowDir: string, language: string, idx: number): string {
  return path.join(workflowDir, 'translation', language, 'chapters', `${chapterId(idx)}.title.txt`);
}

/** A narrated chapter's title in the narration's own language — the translated title (written by the Translate activity) when the chapter was narrated from translated text, otherwise the chapter's original title. Mirrors `chapterLines`'s own-language-vs-translated choice in workflow-tts/index.ts. */
function narratedTitle(workflowDir: string, language: string, record: PackagedContentRecord): string {
  if (record.language === language) {
    return record.title;
  }
  const titleFile = translatedTitleFile(workflowDir, language, record.idx);
  return fs.existsSync(titleFile) ? fs.readFileSync(titleFile, 'utf8').trim() : record.title;
}

/** Chapter indices already narrated under a tts run's `chapters/` subdirectory, sorted ascending. */
function listChapterIndices(dir: string): number[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .map((file) => /^chapter-(\d{4})\.wav$/.exec(file))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

/** A narrated chapter's total duration, read back off its srt's last block end timestamp rather than parsing the wav. */
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

/** Reads a Tts activity's already-produced output — narrated chapter counts for its config — or `null` if it hasn't narrated anything yet. */
export function readTtsOutput(workflowId: string, config: TtsConfig): TtsOutput | null {
  const chaptersGenerated = listChapterIndices(chaptersDir(workflowId, config)).length;
  if (chaptersGenerated === 0) {
    return null;
  }

  const workflowDir = getAppWorkflowExportDir(workflowId);
  const contentsPath = path.join(workflowDir, 'contents.json');
  const totalChapters = fs.existsSync(contentsPath) ? loadPackagedContents(workflowDir).filter((record) => record.type === AppLibraryContentType.Original && record.file).length : 0;

  return { language: config.language, voice: config.voice, pace: config.pace, totalChapters, chaptersGenerated };
}

/** One page of a tts run's narrated chapters, for the Output tab's lazy-loaded Narrated Chapters section. */
export function readTtsChapters(workflowId: string, config: TtsConfig, offset: number, limit: number): PipelineOutputPage<TtsOutputChapter> {
  const dir = chaptersDir(workflowId, config);
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
      title: record ? narratedTitle(workflowDir, config.language, record) : `Chapter ${idx}`,
      durationSec: readDurationSec(path.join(dir, `${chapterId(idx)}.srt`)),
      audioUrl: `${TTS_OUTPUT_PROTOCOL}://output/${encodeURIComponent(workflowId)}/${encodeURIComponent(config.language)}/${chapterId(idx)}.wav`,
    };
  });

  return { items, total: indices.length };
}

/** One chapter's srt subtitles, read on demand when its Output tab row is expanded. `null` if it hasn't been narrated, or `id` isn't a well-formed chapter id. */
export function readTtsChapterSrt(workflowId: string, config: TtsConfig, id: string): string | null {
  if (!CHAPTER_ID_RE.test(id)) {
    return null;
  }
  const filePath = path.join(chaptersDir(workflowId, config), `${id}.srt`);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}
