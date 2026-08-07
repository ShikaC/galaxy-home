-- Pending chat actions (conservative confirm) and capture AI suggestions
ALTER TABLE ai_messages ADD COLUMN pending_action_json TEXT;
ALTER TABLE ai_messages ADD COLUMN proposed_memory_json TEXT;

CREATE TABLE IF NOT EXISTS item_ai_suggestions (
  item_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  category_ids_json TEXT NOT NULL DEFAULT '[]',
  suggest_today INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);
