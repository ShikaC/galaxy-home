CREATE TABLE review_suggestion_conversions (
  review_id TEXT NOT NULL REFERENCES weekly_reviews(id) ON DELETE CASCADE,
  suggestion_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item', 'habit', 'project')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (review_id, suggestion_id)
);
