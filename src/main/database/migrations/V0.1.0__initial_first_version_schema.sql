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
  source_mode TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  cover_url TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
