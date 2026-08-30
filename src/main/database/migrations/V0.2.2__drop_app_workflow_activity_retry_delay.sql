-- Retry/delay were never read by the orchestrator — an activity's failure was never actually
-- retried — so the configuration was a no-op control. Dropped rather than kept dark.
ALTER TABLE app_workflow_activities DROP COLUMN retry;
<---split-statement--->
ALTER TABLE app_workflow_activities DROP COLUMN delay;
