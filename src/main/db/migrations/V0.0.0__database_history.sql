CREATE TABLE IF NOT EXISTS _database_history (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
