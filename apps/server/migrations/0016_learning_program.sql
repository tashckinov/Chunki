-- Real, persistent backing for the placement-test → weak-topics → study →
-- topic-test → spaced reconfirmation loop (previously a fully client-side,
-- unreachable mock). Topics are open-ended (AI-defined key/title/category),
-- not a fixed catalog, since the grader can discover new ones mid-test.

CREATE TABLE placement_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_level TEXT,
  to_level TEXT,
  purpose TEXT[],
  mcq_answers JSONB NOT NULL,
  open9 TEXT NOT NULL,
  open10 TEXT NOT NULL,
  essay TEXT NOT NULL,
  overall_level TEXT NOT NULL,
  skills JSONB NOT NULL,
  above_level TEXT NOT NULL,
  below_level TEXT NOT NULL,
  mcq_score JSONB NOT NULL,
  open_grades JSONB NOT NULL,
  essay_grade JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_placement_tests_user_id ON placement_tests(user_id, created_at DESC);

-- One row per (user, topic). 'key' is an AI-generated slug — stable enough to
-- dedupe repeat discoveries of the same weak spot, not a fixed catalog id.
CREATE TABLE user_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('placement', 'discovered')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'passed_once', 'mastered')),
  -- Cached AI-generated study material — generated once, on first open, not
  -- regenerated every visit. NULL until then.
  study_content JSONB,
  passed_once_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  mastered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

CREATE INDEX idx_user_topics_user_status ON user_topics(user_id, status);

-- One row per attempt at a topic's exercises (initial pass, or the later
-- reconfirmation retest). 'items' holds the full AI-generated exercise set
-- including correct answers — server-only, never sent to the client as-is.
CREATE TABLE topic_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_topic_id UUID NOT NULL REFERENCES user_topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('initial', 'reconfirm')),
  items JSONB NOT NULL,
  answers JSONB,
  score_out_of_10 INTEGER,
  passed BOOLEAN,
  notes JSONB,
  discovered_topics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ
);

CREATE INDEX idx_topic_attempts_user_topic_id ON topic_attempts(user_topic_id);
