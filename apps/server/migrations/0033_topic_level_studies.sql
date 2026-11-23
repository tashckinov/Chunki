CREATE TABLE topic_level_studies (
  topic_key text NOT NULL REFERENCES program_topics(key) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1')),
  study_content jsonb,
  generation_token uuid,
  generation_expires_at timestamptz,
  PRIMARY KEY (topic_key, level),
  CHECK ((generation_token IS NULL) = (generation_expires_at IS NULL)),
  CHECK (study_content IS NULL OR generation_token IS NULL)
);
