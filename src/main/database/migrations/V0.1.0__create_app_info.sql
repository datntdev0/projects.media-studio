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
