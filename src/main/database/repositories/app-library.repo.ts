import { randomUUID } from 'node:crypto';
import type { Db } from '../client';
import type { AppLibrary, AppLibraryDraft, AppLibraryType, ListAppLibrariesFilter } from '../../../shared/app-library';

interface AppLibraryRow {
  id: string;
  title: string;
  type: string;
  cover_url: string | null;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

function metadataOf(draft: AppLibraryDraft): unknown {
  switch (draft.type) {
    case 'novel':
      return draft.novelMetadata;
    case 'image':
      return draft.imageMetadata;
    case 'video':
      return draft.videoMetadata;
  }
}

function toAppLibrary(row: AppLibraryRow): AppLibrary {
  const metadata = row.metadata ? JSON.parse(row.metadata) : null;

  return {
    id: row.id,
    title: row.title,
    type: row.type as AppLibraryType,
    coverUrl: row.cover_url,
    novelMetadata: row.type === 'novel' ? metadata : null,
    imageMetadata: row.type === 'image' ? metadata : null,
    videoMetadata: row.type === 'video' ? metadata : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAppLibrary(db: Db, id: string): AppLibrary | undefined {
  const row = db.prepare('SELECT * FROM app_libraries WHERE id = ?').get(id) as AppLibraryRow | undefined;
  return row ? toAppLibrary(row) : undefined;
}

export function listAppLibraries(db: Db, filter: ListAppLibrariesFilter = {}): AppLibrary[] {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM app_libraries ${where} ORDER BY updated_at DESC`).all(...params) as unknown as AppLibraryRow[];

  return rows.map(toAppLibrary);
}

export function createAppLibrary(db: Db, draft: AppLibraryDraft): AppLibrary {
  const id = randomUUID();
  const now = Date.now();
  const metadata = metadataOf(draft);

  db.prepare(
    `INSERT INTO app_libraries (id, title, type, cover_url, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    draft.title,
    draft.type,
    draft.coverUrl,
    metadata ? JSON.stringify(metadata) : null,
    now,
    now,
  );

  return getAppLibrary(db, id)!;
}

export function updateAppLibrary(db: Db, id: string, draft: AppLibraryDraft): AppLibrary {
  const metadata = metadataOf(draft);

  db.prepare(
    `UPDATE app_libraries
     SET title = ?, type = ?, cover_url = ?, metadata = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    draft.title,
    draft.type,
    draft.coverUrl,
    metadata ? JSON.stringify(metadata) : null,
    Date.now(),
    id,
  );

  return getAppLibrary(db, id)!;
}

export function deleteAppLibrary(db: Db, id: string): void {
  db.prepare('DELETE FROM app_libraries WHERE id = ?').run(id);
}
