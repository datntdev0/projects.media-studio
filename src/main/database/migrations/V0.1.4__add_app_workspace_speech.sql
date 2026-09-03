-- How the workspace's chapters are read aloud: a VieNeu preset voice and a pace.
-- Every workspace reads the same way by default, so both carry the step's defaults
-- rather than NULL — see DEFAULT_SPEECH in src/shared/app-workspace-narration.ts.
ALTER TABLE app_workspaces ADD COLUMN speech_voice TEXT NOT NULL DEFAULT 'Ngọc Huyền';

<---split-statement--->

ALTER TABLE app_workspaces ADD COLUMN speech_pace REAL NOT NULL DEFAULT 1.0;
