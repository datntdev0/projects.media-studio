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

<---split-statement--->

-- Generic cache store keyed by (cache_type, cache_key), e.g. a scraping
-- preview keyed by crawler + source URL. `expires_at` is computed by the
-- repo from the caller's TTL at write time; reads treat an expired row as a
-- miss but leave it in place — nothing sweeps expired rows yet.
CREATE TABLE system_cache (
  cache_type TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  cache_data_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (cache_type, cache_key)
);

<---split-statement--->

-- One row per content item belonging to a library item — a novel's chapter
-- (original or translation), or an image/video set's file. Type-specific
-- fields live in `content` as JSON, mirroring how `app_libraries.metadata`
-- holds its own type-specific block. A translation is its own row sharing
-- `idx` with the original it translates, not a field on the original.
CREATE TABLE app_library_contents (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_library_contents_library_id ON app_library_contents (library_id);

<---split-statement--->

-- One row per scraping job — a range of a crawler-sourced novel's chapters,
-- booked or in flight. `tasks` holds one entry per chapter the job covers,
-- as JSON, mirroring how `app_library_contents.content` holds its own
-- type-specific block: a job is small enough (a novel's chapter count) that
-- a subcollection-style split buys nothing a local, single-user app needs.
CREATE TABLE scraping_jobs (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  library_type TEXT NOT NULL,
  library_title TEXT NOT NULL,
  crawler TEXT NOT NULL,
  status TEXT NOT NULL,
  range TEXT NOT NULL,
  refetch INTEGER NOT NULL,
  retry INTEGER NOT NULL,
  start_at INTEGER,
  queued_at INTEGER,
  completed_at INTEGER,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  tasks TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX scraping_jobs_library_id ON scraping_jobs (library_id);

<---split-statement--->

CREATE INDEX scraping_jobs_status ON scraping_jobs (status);
