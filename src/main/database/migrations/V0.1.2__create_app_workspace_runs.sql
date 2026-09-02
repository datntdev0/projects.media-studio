-- One row per execution of a workspace, immediate or booked for later. `seq` is
-- a per-workspace counter so a run keeps the label it was logged under even
-- after older runs are deleted. `from_chapter`/`to_chapter` scope the run: a
-- sub-step outside the range is not part of it.
CREATE TABLE app_workspace_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  from_chapter INTEGER NOT NULL,
  to_chapter INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspace_runs_workspace_id ON app_workspace_runs (workspace_id);

<---split-statement--->

CREATE UNIQUE INDEX app_workspace_runs_seq ON app_workspace_runs (workspace_id, seq);

<---split-statement--->

-- One row per step the run covers, in the preset's `idx` order — the run's plan
-- and where each step got to. `start_at` is the step's own booked start; NULL
-- means it starts as soon as the step ahead of it completes, which is every step
-- of an immediate run. `retry`/`retry_delay` are per sub-step. `total_count` is
-- how many sub-steps the step covers, which only its handler can work out, so it
-- stays 0 until the step starts; the done and failed counts are not stored at
-- all, but tallied from `app_workspace_activities`.
CREATE TABLE app_workspace_run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  state TEXT NOT NULL,
  start_at INTEGER,
  retry INTEGER NOT NULL,
  retry_delay INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspace_run_steps_run_id ON app_workspace_run_steps (run_id);

<---split-statement--->

CREATE UNIQUE INDEX app_workspace_run_steps_key ON app_workspace_run_steps (run_id, step_key);

<---split-statement--->

-- The history of sub-step runs, not a queue of them: a row is appended once a
-- sub-step has been worked, saying how it went, and the same sub-step can appear
-- more than once as retries attempt it again. A sub-step is a chapter for the
-- chapter-counted steps and an exporting part for the export step, numbered in
-- `sub_step_no`; `attempt` says which try under the step's retry policy this was.
CREATE TABLE app_workspace_activities (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  sub_step_no INTEGER NOT NULL,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  error TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspace_activities_run_step ON app_workspace_activities (run_id, step_key);
