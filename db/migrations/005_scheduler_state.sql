CREATE TABLE scheduler_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_run_at TEXT
);

INSERT INTO scheduler_state (id, last_run_at)
VALUES (1, NULL);
