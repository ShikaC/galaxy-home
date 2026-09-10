CREATE TABLE plan_runs (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  owner_pid INTEGER NOT NULL DEFAULT 0,
  lease_until_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX plan_runs_updated ON plan_runs(updated_at DESC);
