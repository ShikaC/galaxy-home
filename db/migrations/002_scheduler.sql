CREATE INDEX reminders_schedule ON reminders(enabled, scheduled_at, snoozed_until);
CREATE INDEX notification_events_pending ON notification_events(dismissed_at, scheduled_at);
