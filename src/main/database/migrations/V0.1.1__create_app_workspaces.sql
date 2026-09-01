-- One row per workspace — a preset pipeline bound to one library novel.
-- `library_id` is not enforced: deleting the novel leaves the workspace
-- standing, and the listing renders the gap as "Novel removed".
CREATE TABLE app_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  preset TEXT NOT NULL,
  library_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspaces_library_id ON app_workspaces (library_id);

<---split-statement--->

-- One row per step the workspace actually runs — an optional step left off at
-- creation has no row, so `idx` keeps the preset's numbering and gaps (01, 02,
-- 03, 05). Counts are in the step's own unit: chapters for analysis, translation
-- and narration, parts for export. A percentage is derived from them, not stored.
-- `total_count` is 0 until a run scopes the step.
CREATE TABLE app_workspace_steps (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  state TEXT NOT NULL,
  done_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspace_steps_workspace_id ON app_workspace_steps (workspace_id);

<---split-statement--->

CREATE UNIQUE INDEX app_workspace_steps_key ON app_workspace_steps (workspace_id, step_key);
