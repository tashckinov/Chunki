CREATE TABLE study_reminders (
  endpoint TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  local_time TIME NOT NULL,
  time_zone TEXT NOT NULL,
  last_sent_on DATE
);
