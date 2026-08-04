CREATE TABLE project_ai_sessions (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('clarifying', 'ready', 'applied')),
  questions_json TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '[]',
  draft_json TEXT,
  base_updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
