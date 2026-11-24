CREATE TABLE curriculum_modules (
  id text PRIMARY KEY CHECK (length(id) <= 72 AND id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  level text NOT NULL CHECK (level IN ('A1','A2','A2+','B1','B1+','B2','B2+','C1')),
  position integer NOT NULL CHECK (position >= 0),
  type text NOT NULL CHECK (type IN ('core', 'supplementary'))
);

CREATE TABLE curriculum_module_topics (
  module_id text NOT NULL REFERENCES curriculum_modules(id) ON DELETE CASCADE,
  topic_id text NOT NULL REFERENCES curriculum_topics(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (module_id, topic_id),
  UNIQUE (module_id, position)
);
CREATE INDEX curriculum_module_topics_topic_idx ON curriculum_module_topics(topic_id);
