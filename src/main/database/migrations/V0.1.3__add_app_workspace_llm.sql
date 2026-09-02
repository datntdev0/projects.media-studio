-- Which LLM the workspace's steps call. NULL means the workspace has made no
-- choice of its own and follows `llm` in config.json, which is how every
-- workspace created before this column starts out. The engine is a command on
-- PATH (`claude`, `codex`) and the model is whatever that command accepts, so
-- neither is constrained here.
ALTER TABLE app_workspaces ADD COLUMN llm_engine TEXT;

<---split-statement--->

ALTER TABLE app_workspaces ADD COLUMN llm_model TEXT;
