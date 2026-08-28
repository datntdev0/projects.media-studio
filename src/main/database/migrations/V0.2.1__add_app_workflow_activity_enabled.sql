-- Lets a workflow activity be disabled without removing it from the canvas —
-- the orchestrator skips a disabled activity's run while still letting its
-- dependents proceed once its (skipped) turn has passed.
ALTER TABLE app_workflow_activities ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
