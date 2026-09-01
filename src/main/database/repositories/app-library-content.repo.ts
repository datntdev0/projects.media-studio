import { randomUUID } from 'node:crypto';
import type { Db } from '@/main/database/client';
import { contentFilePath, deleteContentFile, readContentFile, writeContentFile } from '@/main/helpers/content-storage';
import type { AppLibraryType } from '@/shared/app-library';
import { AppLibraryContentType, type CreateAppLibraryContentInput, type AppLibraryContent, type AppLibraryContentStatus, type ListAppLibraryContentsFilter } from '@/shared/app-library-content';

interface AppLibraryContentRow {
  id: string;
  library_id: string;
  idx: number;
  type: string;
  status: string;
  metadata: string | null;
  content_path: string | null;
  created_at: number;
  updated_at: number;
}

function isText(type: AppLibraryContentType): boolean {
  return type === AppLibraryContentType.Original || type === AppLibraryContentType.Translation;
}

/**
 * What goes in the row's `metadata` column: the type-specific block minus anything held on disk.
 * A text block's `body` is stripped here — it belongs to the file `content_path` names.
 */
function metadataOf(input: CreateAppLibraryContentInput): unknown {
  switch (input.type) {
    case AppLibraryContentType.Original:
    case AppLibraryContentType.Translation: {
      if (!input.textContent) return null;
      const { body: _body, ...metadata } = input.textContent;
      return metadata;
    }
    case AppLibraryContentType.Image:
      return input.imageContent ?? null;
    case AppLibraryContentType.Video:
      return input.videoContent ?? null;
  }
}

/** The library's own type, needed to name the folder its content files live in. */
function libraryTypeOf(db: Db, libraryId: string): AppLibraryType {
  const row = db.prepare('SELECT type FROM app_libraries WHERE id = ?').get(libraryId) as { type: string } | undefined;
  if (!row) {
    throw new Error(`Library item ${libraryId} not found`);
  }
  return row.type as AppLibraryType;
}

/** Rebuilds the row, reading a text body back off disk so callers still see it inline. */
function toAppLibraryContent(row: AppLibraryContentRow): AppLibraryContent {
  const type = row.type as AppLibraryContentType;
  const block = row.metadata ? JSON.parse(row.metadata) : null;

  return {
    id: row.id,
    libraryId: row.library_id,
    idx: row.idx,
    type,
    status: row.status as AppLibraryContentStatus,
    contentPath: row.content_path,
    textContent: isText(type) && block ? { ...block, body: readContentFile(row.content_path) } : null,
    imageContent: type === AppLibraryContentType.Image ? block : null,
    videoContent: type === AppLibraryContentType.Video ? block : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Writes a text row's body to disk and returns the path recorded for it, or null when this row
 * holds no text. The file is written even when the body is empty, so the path a row advertises
 * always exists.
 */
function persistBody(db: Db, libraryId: string, input: CreateAppLibraryContentInput): string | null {
  if (!isText(input.type) || !input.textContent) {
    return null;
  }

  const relativePath = contentFilePath(libraryTypeOf(db, libraryId), libraryId, input.type, input.idx, input.textContent.language);
  writeContentFile(relativePath, input.textContent.body);
  return relativePath;
}

export function getAppLibraryContent(db: Db, libraryId: string, id: string): AppLibraryContent | undefined {
  const row = db.prepare('SELECT * FROM app_library_contents WHERE library_id = ? AND id = ?').get(libraryId, id) as AppLibraryContentRow | undefined;
  return row ? toAppLibraryContent(row) : undefined;
}

export function listAppLibraryContents(db: Db, libraryId: string, filter: ListAppLibraryContentsFilter = {}): AppLibraryContent[] {
  const clauses = ['library_id = ?'];
  const params: string[] = [libraryId];

  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }
  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }

  const rows = db
    .prepare(`SELECT * FROM app_library_contents WHERE ${clauses.join(' AND ')} ORDER BY idx ASC, created_at ASC`)
    .all(...params) as unknown as AppLibraryContentRow[];
  const items = rows.map(toAppLibraryContent);

  if (!filter.language) return items;
  return items.filter((item) => item.textContent?.language === filter.language);
}

export function createAppLibraryContent(db: Db, libraryId: string, input: CreateAppLibraryContentInput): AppLibraryContent {
  const id = randomUUID();
  const now = Date.now();
  const block = metadataOf(input);
  const contentPath = persistBody(db, libraryId, input);

  db.prepare(
    `INSERT INTO app_library_contents (id, library_id, idx, type, status, metadata, content_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, libraryId, input.idx, input.type, input.status, block ? JSON.stringify(block) : null, contentPath, now, now);

  return getAppLibraryContent(db, libraryId, id)!;
}

export function updateAppLibraryContent(db: Db, libraryId: string, id: string, input: CreateAppLibraryContentInput): AppLibraryContent {
  const block = metadataOf(input);
  const contentPath = persistBody(db, libraryId, input);

  // An edit that moves the row (a new idx, or a translation's language) leaves the old file
  // behind, so drop it once the new one is safely written.
  const previous = getAppLibraryContent(db, libraryId, id);
  if (previous?.contentPath && previous.contentPath !== contentPath) {
    deleteContentFile(previous.contentPath);
  }

  db.prepare(
    `UPDATE app_library_contents SET idx = ?, type = ?, status = ?, metadata = ?, content_path = ?, updated_at = ? WHERE library_id = ? AND id = ?`,
  ).run(input.idx, input.type, input.status, block ? JSON.stringify(block) : null, contentPath, Date.now(), libraryId, id);

  return getAppLibraryContent(db, libraryId, id)!;
}

export function deleteAppLibraryContent(db: Db, libraryId: string, id: string): void {
  deleteContentFile(getAppLibraryContent(db, libraryId, id)?.contentPath ?? null);
  db.prepare('DELETE FROM app_library_contents WHERE library_id = ? AND id = ?').run(libraryId, id);
}

/** Cascades a library item's deletion — there is no DB-level foreign key, so the manager calls this explicitly. The files go with the item's folder, which the manager removes. */
export function deleteAppLibraryContentsByLibraryId(db: Db, libraryId: string): void {
  db.prepare('DELETE FROM app_library_contents WHERE library_id = ?').run(libraryId);
}
