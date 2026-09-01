-- One row per execution of a workspace, immediate or booked for later. `seq` is
-- a per-workspace counter so a run keeps the label it was logged under even
-- after older runs are deleted. `from_chapter`/`to_chapter` scope the run: a
-- sub-step outside the range is not part of it.
--
-- `steps` holds the run's step plan as a JSON array — one entry per step the run
-- covers, with its booked start time, its retry policy and where it got to. The
-- steps are a fixed short list per run, so they ride on the run itself rather
-- than in a table of their own; their counts are aggregated from the sub-step
-- rows in `app_workspace_activities`.
CREATE TABLE app_workspace_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  from_chapter INTEGER NOT NULL,
  to_chapter INTEGER NOT NULL,
  steps TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX app_workspace_runs_workspace_id ON app_workspace_runs (workspace_id);

<---split-statement--->

CREATE UNIQUE INDEX app_workspace_runs_seq ON app_workspace_runs (workspace_id, seq);

<---split-statement--->

-- One row per sub-step run: a chapter for the chapter-counted steps, an
-- exporting part for the export step. `sub_step_no` is that number, in the
-- step's own unit. This is the unit of work a run is made of — a step's
-- progress is a count over its rows here — and `attempt` counts the tries a
-- sub-step has taken under the step's retry policy.
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

<---split-statement--->

CREATE UNIQUE INDEX app_workspace_activities_sub_step ON app_workspace_activities (run_id, step_key, sub_step_no);
