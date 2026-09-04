-- The art style Frame Illustration draws in. It scopes the image files the way the
-- voice scopes narration audio, so every workspace carries one rather than NULL —
-- see DEFAULT_ART_STYLE in src/shared/app-workspace-illustration.ts.
ALTER TABLE app_workspaces ADD COLUMN art_style TEXT NOT NULL DEFAULT '2D_chinese_guofeng';
