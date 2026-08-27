-- One row per workflow — a name/description/status paired with the library
-- item it operates on. The library reference is fixed at creation, with its
-- type/title denormalized alongside the id so the listing needs no join,
-- mirroring how `scraping_jobs` carries its own library_type/library_title.
CREATE TABLE app_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  library_id TEXT NOT NULL,
  library_type TEXT NOT NULL,
  library_title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workflows_library_id ON app_workflows (library_id);

<---split-statement--->

-- One row per activity node on a workflow's canvas. `config` holds one of
-- five type-specific JSON blocks (exactly one set, matching `type`),
-- mirroring how `app_library_contents.content` holds its own type-specific
-- block. `dependencies` is a JSON array of other activity ids on the same
-- workflow that must complete before this one runs.
CREATE TABLE app_workflow_activities (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  retry INTEGER NOT NULL,
  delay INTEGER NOT NULL,
  config TEXT NOT NULL,
  dependencies TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workflow_activities_workflow_id ON app_workflow_activities (workflow_id);

<---split-statement--->

-- One row per run overview (`activity_id` null) plus one row per activity
-- execution within that run (`activity_id` set), grouped by `run_id`.
-- `activity_name`/`activity_type` are denormalized so a run stays readable
-- after its activity is edited or removed. `range` holds a short summary of
-- the chapter selection an activity ran over, if any.
CREATE TABLE app_workflow_history (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  activity_id TEXT,
  activity_name TEXT,
  activity_type TEXT,
  status TEXT NOT NULL,
  range TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workflow_history_workflow_id ON app_workflow_history (workflow_id);
CREATE INDEX app_workflow_history_run_id ON app_workflow_history (run_id);
