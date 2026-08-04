CREATE TABLE workspace_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  workspace_name TEXT NOT NULL DEFAULT '我的空间',
  ai_nickname TEXT NOT NULL DEFAULT '星伴',
  user_name TEXT NOT NULL DEFAULT '你',
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  ai_permission TEXT NOT NULL DEFAULT 'conservative' CHECK (ai_permission IN ('conservative', 'open')),
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0, 1)),
  backup_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (backup_retention_days BETWEEN 7 AND 365),
  trash_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (trash_retention_days BETWEEN 1 AND 365),
  morning_reminder_time TEXT NOT NULL DEFAULT '09:00',
  morning_reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (morning_reminder_enabled IN (0, 1)),
  evening_reminder_time TEXT NOT NULL DEFAULT '21:00',
  evening_reminder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (evening_reminder_enabled IN (0, 1)),
  weekly_review_time TEXT NOT NULL DEFAULT '20:00',
  weekly_review_enabled INTEGER NOT NULL DEFAULT 1 CHECK (weekly_review_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO workspace_settings (id, created_at, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE daily_quote_selections (
  local_date TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  selected_at TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TEXT,
  reminder_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  completed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_tutorial INTEGER NOT NULL DEFAULT 0 CHECK (is_tutorial IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (due_at IS NOT NULL OR reminder_minutes IS NULL)
);

CREATE TABLE item_categories (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, category_id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desired_outcome TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  deadline_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  progress_source TEXT NOT NULL DEFAULT 'manual' CHECK (progress_source IN ('manual', 'ai')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  deleted_at TEXT
);

CREATE TABLE item_projects (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, project_id)
);

CREATE TABLE today_items (
  local_date TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_focus INTEGER NOT NULL DEFAULT 0 CHECK (is_focus IN (0, 1)),
  is_secondary INTEGER NOT NULL DEFAULT 0 CHECK (is_secondary IN (0, 1)),
  PRIMARY KEY (local_date, item_id)
);

CREATE UNIQUE INDEX one_focus_item_per_day
ON today_items(local_date) WHERE is_focus = 1;

CREATE TABLE project_stages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  outcome TEXT,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'completed', 'future')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_id TEXT REFERENCES project_stages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('current', 'next', 'completed')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES project_tasks(id) ON DELETE SET NULL,
  outcome TEXT,
  obstacle TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('check', 'count')),
  target_count INTEGER NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  frequency_type TEXT NOT NULL DEFAULT 'daily' CHECK (frequency_type IN ('daily', 'weekly')),
  weekly_target INTEGER CHECK (weekly_target BETWEEN 1 AND 7),
  rest_days_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_tutorial INTEGER NOT NULL DEFAULT 0 CHECK (is_tutorial IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE habit_schedules (
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY (habit_id, weekday)
);

CREATE TABLE habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'leave')),
  corrected INTEGER NOT NULL DEFAULT 0 CHECK (corrected IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (habit_id, local_date)
);

CREATE TABLE habit_exceptions (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('leave', 'rest_override')),
  created_at TEXT NOT NULL,
  UNIQUE (habit_id, local_date)
);

CREATE TABLE daily_gains (
  id TEXT PRIMARY KEY,
  local_date TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE weekly_reviews (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  completed_json TEXT NOT NULL DEFAULT '[]',
  obstacles_json TEXT NOT NULL DEFAULT '[]',
  suggestions_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  references_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE ai_memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'goal', 'background')),
  confirmed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE ai_action_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  undo_payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  undone_at TEXT
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('morning', 'deadline', 'evening', 'weekly_review')),
  entity_id TEXT,
  scheduled_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  snoozed_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_events (
  id TEXT PRIMARY KEY,
  reminder_id TEXT REFERENCES reminders(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  delivered_at TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE trash_entries (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
);

CREATE TABLE tutorial_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  examples_created INTEGER NOT NULL DEFAULT 0 CHECK (examples_created IN (0, 1)),
  guide_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (guide_dismissed IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO tutorial_state (id, updated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE INDEX items_active_order ON items(status, deleted_at, sort_order, created_at DESC);
CREATE INDEX item_categories_category ON item_categories(category_id, sort_order);
CREATE INDEX item_projects_project ON item_projects(project_id);
CREATE INDEX today_items_day_order ON today_items(local_date, is_secondary, sort_order);
CREATE INDEX projects_status_pinned ON projects(status, pinned DESC, updated_at DESC);
CREATE INDEX project_stages_project_order ON project_stages(project_id, sort_order);
CREATE INDEX project_tasks_project_position ON project_tasks(project_id, position);
CREATE INDEX habit_logs_habit_date ON habit_logs(habit_id, local_date DESC);
CREATE INDEX daily_gains_date ON daily_gains(local_date DESC, created_at DESC);
CREATE INDEX ai_messages_conversation_time ON ai_messages(conversation_id, created_at);
CREATE INDEX trash_entries_purge_after ON trash_entries(purge_after);
