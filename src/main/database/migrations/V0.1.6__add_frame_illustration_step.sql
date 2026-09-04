-- Frame Illustration was released after these workspaces were created, so they
-- have no row for it and the step reads as "Not in this pipeline". Give every
-- audio-novel workspace the step, pending and unscoped, exactly as a workspace
-- created today with the option on gets it. `idx` is 4, keeping the preset's
-- numbering. A workspace that already has the row — one created since the
-- release — is left alone by the WHERE NOT EXISTS.
INSERT INTO app_workspace_steps (id, workspace_id, idx, step_key, state, done_count, failed_count, total_count, created_at, updated_at)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2)
    || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  workspace.id,
  4,
  'frame-illustration',
  'pending',
  0,
  0,
  0,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM app_workspaces AS workspace
WHERE workspace.preset = 'audio-novel'
  AND NOT EXISTS (
    SELECT 1 FROM app_workspace_steps AS step
    WHERE step.workspace_id = workspace.id AND step.step_key = 'frame-illustration'
  );
