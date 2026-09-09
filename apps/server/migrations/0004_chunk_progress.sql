-- Hand-authored scenario for the production check (stage 2/5). NULL means
-- this chunk can't enter the production-check stage yet — callers should
-- skip straight to keeping the current self-report/recognition outcome as
-- the best signal. Backfilling this for real content is a separate,
-- out-of-scope content-authoring task.
ALTER TABLE chunks ADD COLUMN situation_prompt TEXT;

-- One row per (user, chunk): current mastery state in the activation
-- pipeline. 'unseen' is rarely materialized (no row = unseen); kept in the
-- enum for explicitness when a row is written back to it.
CREATE TABLE chunk_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'unseen' CHECK (state IN (
    'unseen',                 -- never swiped
    'unknown',                -- stage 1: swiped "don't know"
    'unsure',                 -- stage 1: swiped "not sure"
    'self_known',             -- stage 1: swiped "know", not yet production-verified
    'recognition_confirmed',  -- stage 4 passed (came from unknown/unsure), awaiting production check
    'active',                 -- production confirmed (stage 2 or 5) — "В моей речи"
    'passive'                 -- production check ran but only meaning conveyed, not the chunk itself
  )),
  times_reviewed INTEGER NOT NULL DEFAULT 0,
  times_production_attempted INTEGER NOT NULL DEFAULT 0,
  times_production_passed INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  last_production_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, chunk_id)
);

CREATE INDEX idx_chunk_progress_user_id ON chunk_progress(user_id);
CREATE INDEX idx_chunk_progress_user_state ON chunk_progress(user_id, state);
