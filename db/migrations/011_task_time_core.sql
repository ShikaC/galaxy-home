ALTER TABLE items ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
ALTER TABLE items ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'
  CHECK (priority IN ('none', 'low', 'medium', 'high'));
ALTER TABLE items ADD COLUMN parent_id TEXT REFERENCES items(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN due_date TEXT;
ALTER TABLE items ADD COLUMN estimated_minutes INTEGER
  CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440);
ALTER TABLE items ADD COLUMN scheduled_start_at TEXT;
ALTER TABLE items ADD COLUMN scheduled_end_at TEXT;
ALTER TABLE items ADD COLUMN schedule_timezone TEXT;
ALTER TABLE items ADD COLUMN is_fixed INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed IN (0, 1));

CREATE TABLE task_series (
  id TEXT PRIMARY KEY,
  create_request_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  title TEXT NOT NULL,
  notes TEXT,
  priority TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('none', 'low', 'medium', 'high')),
  category_ids_json TEXT NOT NULL DEFAULT '[]',
  project_ids_json TEXT NOT NULL DEFAULT '[]',
  timezone TEXT NOT NULL,
  start_date TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes BETWEEN 1 AND 1440),
  due_time TEXT,
  reminder_minutes INTEGER CHECK (reminder_minutes IS NULL OR reminder_minutes >= 0),
  reminder_rules_json TEXT NOT NULL DEFAULT '[]',
  materialized_through_date TEXT,
  materialization_error_json TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE task_occurrences (
  series_id TEXT NOT NULL REFERENCES task_series(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  item_id TEXT UNIQUE REFERENCES items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'skipped')),
  is_exception INTEGER NOT NULL DEFAULT 0 CHECK (is_exception IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (series_id, occurrence_date)
);

CREATE TABLE task_reminder_rules (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  anchor TEXT NOT NULL CHECK (anchor IN ('due', 'scheduled')),
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (item_id, anchor, offset_minutes)
);

INSERT INTO task_reminder_rules
  (id, item_id, anchor, offset_minutes, version, enabled, created_at, updated_at)
SELECT 'legacy-due:' || id, id, 'due', reminder_minutes, 1, 1, created_at, updated_at
FROM items
WHERE reminder_minutes IS NOT NULL AND due_at IS NOT NULL;

CREATE TABLE item_create_requests (
  request_id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE task_plan_runs (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  owner_pid INTEGER,
  lease_until_ms INTEGER
);

ALTER TABLE reminders ADD COLUMN task_rule_id TEXT;
ALTER TABLE reminders ADD COLUMN task_rule_version INTEGER;

CREATE TABLE notification_snooze_requests (
  request_id TEXT PRIMARY KEY,
  request_event_id TEXT NOT NULL,
  event_id TEXT REFERENCES notification_events(id) ON DELETE SET NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 5 AND 1440),
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX items_parent_status ON items(parent_id, status, deleted_at);
CREATE INDEX items_scheduled_range ON items(scheduled_start_at, scheduled_end_at)
  WHERE deleted_at IS NULL AND scheduled_start_at IS NOT NULL;
CREATE INDEX task_series_status_start ON task_series(status, start_date)
  WHERE deleted_at IS NULL;
CREATE INDEX task_occurrences_date_status ON task_occurrences(occurrence_date, status);
CREATE INDEX task_occurrences_series_status_date
  ON task_occurrences(series_id, status, occurrence_date);
CREATE INDEX task_reminder_rules_item_enabled ON task_reminder_rules(item_id, enabled);
CREATE INDEX item_create_requests_item ON item_create_requests(item_id);
CREATE UNIQUE INDEX reminders_task_rule_delivery_identity
  ON reminders(task_rule_id, task_rule_version, scheduled_at)
  WHERE task_rule_id IS NOT NULL;
CREATE INDEX notification_snooze_requests_event ON notification_snooze_requests(event_id);

CREATE TRIGGER items_business_update_version
AFTER UPDATE OF title, notes, due_at, reminder_minutes, status, completed_at, sort_order,
  is_tutorial, deleted_at, priority, parent_id, due_date, estimated_minutes,
  scheduled_start_at, scheduled_end_at, schedule_timezone, is_fixed
ON items
WHEN NEW.version = OLD.version
BEGIN
  UPDATE items SET version = OLD.version + 1 WHERE id = NEW.id;
END;

CREATE TRIGGER items_parent_insert_version AFTER INSERT ON items
WHEN NEW.parent_id IS NOT NULL
BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.parent_id;
END;

CREATE TRIGGER items_parent_relation_update_version
AFTER UPDATE OF parent_id, status, deleted_at ON items
BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.parent_id AND OLD.parent_id IS NOT NULL;
  UPDATE items SET version = version + 1
    WHERE id = NEW.parent_id AND NEW.parent_id IS NOT NULL AND NEW.parent_id IS NOT OLD.parent_id;
END;

CREATE TRIGGER item_categories_insert_version AFTER INSERT ON item_categories BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
CREATE TRIGGER item_categories_delete_version AFTER DELETE ON item_categories BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
END;
CREATE TRIGGER item_categories_update_version AFTER UPDATE ON item_categories BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id AND NEW.item_id != OLD.item_id;
END;

CREATE TRIGGER item_projects_insert_version AFTER INSERT ON item_projects BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
CREATE TRIGGER item_projects_delete_version AFTER DELETE ON item_projects BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
END;
CREATE TRIGGER item_projects_update_version AFTER UPDATE ON item_projects BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id AND NEW.item_id != OLD.item_id;
END;

CREATE TRIGGER today_items_insert_version AFTER INSERT ON today_items BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
CREATE TRIGGER today_items_delete_version AFTER DELETE ON today_items BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
END;
CREATE TRIGGER today_items_update_version AFTER UPDATE ON today_items BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id AND NEW.item_id != OLD.item_id;
END;

CREATE TRIGGER task_occurrences_insert_version AFTER INSERT ON task_occurrences
WHEN NEW.item_id IS NOT NULL BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
CREATE TRIGGER task_occurrences_delete_version AFTER DELETE ON task_occurrences
WHEN OLD.item_id IS NOT NULL BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
END;
CREATE TRIGGER task_occurrences_update_version AFTER UPDATE ON task_occurrences BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id AND OLD.item_id IS NOT NULL;
  UPDATE items SET version = version + 1
    WHERE id = NEW.item_id AND NEW.item_id IS NOT NULL AND NEW.item_id IS NOT OLD.item_id;
END;

CREATE TRIGGER task_reminder_rules_insert_version AFTER INSERT ON task_reminder_rules BEGIN
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id;
END;
CREATE TRIGGER task_reminder_rules_delete_version AFTER DELETE ON task_reminder_rules BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
END;
CREATE TRIGGER task_reminder_rules_update_version AFTER UPDATE ON task_reminder_rules BEGIN
  UPDATE items SET version = version + 1 WHERE id = OLD.item_id;
  UPDATE items SET version = version + 1 WHERE id = NEW.item_id AND NEW.item_id != OLD.item_id;
END;
