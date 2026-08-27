import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../database/client';
import { COVER_PROTOCOL, getAppCoverDir, getAppWorkflowExportDir } from './paths';
import { getAppLibrary } from '../database/repositories/app-library.repo';
import { listAppLibraryContents } from '../database/repositories/app-library-content.repo';
import { AppLibraryContentType } from '../../shared/app-library-content';
import type { AppWorkflow } from '../../shared/app-workflow';

// Zero-padded body file names, e.g. contents/original/0001.txt — same width as the companion cloud project's export package.
const POSITION_WIDTH = 4;

interface PackagedContent {
  id: string;
  idx: number;
  type: AppLibraryContentType.Original | AppLibraryContentType.Translation;
  language: string;
  title: string;
  words: number;
  sourceUrl: string | null;
  file: string | null;
}

function padded(position: number): string {
  return String(position).padStart(POSITION_WIDTH, '0');
}

function wordCount(body: string): number {
  const trimmed = body.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function writeBody(dir: string, file: string, body: string): void {
  const target = path.join(dir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body, 'utf8');
}

function copyCover(dir: string, coverUrl: string | null): void {
  if (!coverUrl || !coverUrl.startsWith(`${COVER_PROTOCOL}://`)) {
    return;
  }

  const fileName = path.basename(decodeURIComponent(new URL(coverUrl).pathname));
  const source = path.join(getAppCoverDir(), fileName);
  if (!fs.existsSync(source)) {
    return;
  }

  fs.copyFileSync(source, path.join(dir, `cover${path.extname(fileName)}`));
}

/**
 * Exports a novel library's chapters into `data/workflows/<workflowId>/` — a manifest, the
 * library's own record, its cover, and one `.txt` per chapter body, mirroring the export
 * package layout of the companion cloud project. Idempotent: a workflow that already has an
 * export directory is left alone, so this only ever runs once per workflow.
 */
export function exportNovelLibrary(db: Db, workflow: AppWorkflow): void {
  const dir = getAppWorkflowExportDir(workflow.id);
  if (fs.existsSync(dir)) {
    return;
  }

  const library = getAppLibrary(db, workflow.libraryId);
  if (!library) {
    return;
  }

  fs.mkdirSync(dir, { recursive: true });

  const contents = listAppLibraryContents(db, workflow.libraryId).filter(
    (content) => content.type === AppLibraryContentType.Original || content.type === AppLibraryContentType.Translation,
  );

  const records: PackagedContent[] = [];
  let originalPosition = 0;
  const translationPositions = new Map<string, number>();

  for (const content of contents) {
    const body = content.textContent?.body;
    const language = content.textContent?.language ?? '';
    let file: string | null = null;

    if (body) {
      if (content.type === AppLibraryContentType.Original) {
        originalPosition += 1;
        file = `contents/original/${padded(originalPosition)}.txt`;
      } else {
        const position = (translationPositions.get(language) ?? 0) + 1;
        translationPositions.set(language, position);
        file = `contents/translation/${language}/${padded(position)}.txt`;
      }
      writeBody(dir, file, body);
    }

    records.push({
      id: content.id,
      idx: content.idx,
      type: content.type as PackagedContent['type'],
      language,
      title: content.textContent?.title ?? '',
      words: body ? wordCount(body) : 0,
      sourceUrl: content.sourceUrl,
      file,
    });
  }

  fs.writeFileSync(path.join(dir, 'contents.json'), JSON.stringify(records, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'item.json'), JSON.stringify(library, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify(
      {
        schema: 1,
        exportedAt: new Date().toISOString(),
        source: { libraryId: library.id, title: library.title },
        counts: { contents: records.length, bodies: records.filter((record) => record.file).length },
      },
      null,
      2,
    ),
    'utf8',
  );

  copyCover(dir, library.coverUrl);
}

/** Removes a workflow's export directory, if it has one — for the manager to call when the workflow itself is deleted. */
export function deleteWorkflowExport(workflowId: string): void {
  fs.rmSync(getAppWorkflowExportDir(workflowId), { recursive: true, force: true });
}
