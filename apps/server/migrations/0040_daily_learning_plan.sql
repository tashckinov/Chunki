ALTER TABLE user_topics DROP CONSTRAINT user_topics_source_check;
ALTER TABLE user_topics ADD CONSTRAINT user_topics_source_check CHECK (source IN ('placement', 'discovered', 'self'));

CREATE TABLE daily_learning_plans (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  review_ids uuid[] NOT NULL,
  new_topic_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
