CREATE TABLE topic_study_suggestions (
  topic_key text NOT NULL REFERENCES program_topics(key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_key, user_id)
);

CREATE INDEX topic_study_suggestions_latest ON topic_study_suggestions (topic_key, updated_at DESC, user_id);
