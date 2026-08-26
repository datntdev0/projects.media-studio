import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import { AppLibraryContentType, type CreateAppLibraryContentInput, type AppLibraryContent, type AppLibraryContentStatus, type ListAppLibraryContentsFilter } from '../../../shared/app-library-content';

interface AppLibraryContentRow {
  id: string;
  library_id: string;
  idx: number;
  type: string;
  status: string;
  source_url: string | null;
  content: string | null;
  created_at: number;
  updated_at: number;
}

function contentBlockOf(input: CreateAppLibraryContentInput): unknown {
  switch (input.type) {
    case AppLibraryContentType.Original:
    case AppLibraryContentType.Translation:
      return input.textContent ?? null;
    case AppLibraryContentType.Audio:
      return input.audioContent ?? null;
    case AppLibraryContentType.Image:
      return input.imageContent ?? null;
    case AppLibraryContentType.Video:
      return input.videoContent ?? null;
  }
}

function toAppLibraryContent(row: AppLibraryContentRow): AppLibraryContent {
  const type = row.type as AppLibraryContentType;
  const block = row.content ? JSON.parse(row.content) : null;

  return {
    id: row.id,
    libraryId: row.library_id,
    idx: row.idx,
    type,
    status: row.status as AppLibraryContentStatus,
    sourceUrl: row.source_url,
    textContent: type === AppLibraryContentType.Original || type === AppLibraryContentType.Translation ? block : null,
    audioContent: type === AppLibraryContentType.Audio ? block : null,
    imageContent: type === AppLibraryContentType.Image ? block : null,
    videoContent: type === AppLibraryContentType.Video ? block : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  return items.filter((item) => item.textContent?.language === filter.language || item.audioContent?.language === filter.language);
}

export function createAppLibraryContent(db: Db, libraryId: string, input: CreateAppLibraryContentInput): AppLibraryContent {
  const id = randomUUID();
  const now = Date.now();
  const block = contentBlockOf(input);

  db.prepare(
    `INSERT INTO app_library_contents (id, library_id, idx, type, status, source_url, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, libraryId, input.idx, input.type, input.status, input.sourceUrl ?? null, block ? JSON.stringify(block) : null, now, now);

  return getAppLibraryContent(db, libraryId, id)!;
}

export function updateAppLibraryContent(db: Db, libraryId: string, id: string, input: CreateAppLibraryContentInput): AppLibraryContent {
  const block = contentBlockOf(input);

  db.prepare(
    `UPDATE app_library_contents SET idx = ?, type = ?, status = ?, source_url = ?, content = ?, updated_at = ? WHERE library_id = ? AND id = ?`,
  ).run(input.idx, input.type, input.status, input.sourceUrl ?? null, block ? JSON.stringify(block) : null, Date.now(), libraryId, id);

  return getAppLibraryContent(db, libraryId, id)!;
}

export function deleteAppLibraryContent(db: Db, libraryId: string, id: string): void {
  db.prepare('DELETE FROM app_library_contents WHERE library_id = ? AND id = ?').run(libraryId, id);
}

/** Cascades a library item's deletion — there is no DB-level foreign key, so the manager calls this explicitly. */
export function deleteAppLibraryContentsByLibraryId(db: Db, libraryId: string): void {
  db.prepare('DELETE FROM app_library_contents WHERE library_id = ?').run(libraryId);
}
