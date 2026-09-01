-- The whole schema as it stands. Every migration up to V0.3.2 was folded back
-- into this file: the scraping and workflow tables were created and then dropped
-- again, so replaying that history bought nothing, and the columns later
-- migrations removed are simply absent here.

-- Single-row table: no primary key needed, since the app only ever tracks
-- one record — the repo enforces that by clearing the table before every
-- insert (see upsertAppInfo).
CREATE TABLE app_info (
  app_name TEXT NOT NULL,
  app_version TEXT NOT NULL,
  install_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

<---split-statement--->

-- One row per library item — a novel, an image set, or a video set.
-- Type-specific counters (novel/image/video) live in `metadata` as JSON,
-- since only one of the three ever applies to a given row.
CREATE TABLE app_libraries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  cover_url TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

<---split-statement--->

-- One row per content item belonging to a library item — a novel's chapter
-- (original or translation), or an image/video set's file. A translation is its
-- own row sharing `idx` with the original it translates, not a field on the
-- original.
--
-- `metadata` holds the type-specific block as JSON — a chapter's title and
-- language — mirroring how `app_libraries.metadata` holds its own. The payload
-- itself is not in the row: `content_path` names a file under the app data
-- directory (data/libraries/<type>.<library_id>/chapter-0001.txt), relative to
-- that directory so moving the data folder does not invalidate every row.
CREATE TABLE app_library_contents (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata TEXT,
  content_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_library_contents_library_id ON app_library_contents (library_id);
