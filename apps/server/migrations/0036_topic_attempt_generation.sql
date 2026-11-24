ALTER TABLE user_topics
  ADD COLUMN attempt_generation_token uuid,
  ADD COLUMN attempt_generation_expires_at timestamptz;
