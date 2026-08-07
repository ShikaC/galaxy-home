ALTER TABLE workspace_settings ADD COLUMN onboarding_completed_at TEXT;

UPDATE workspace_settings
SET onboarding_completed_at = created_at
WHERE onboarding_completed = 1 AND onboarding_completed_at IS NULL;
