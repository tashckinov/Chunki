CREATE TABLE topic_study_ratings (
  topic_key text NOT NULL REFERENCES program_topics(key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('clear', 'unclear')),
  PRIMARY KEY (topic_key, user_id)
);
