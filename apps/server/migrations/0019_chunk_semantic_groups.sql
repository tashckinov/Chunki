-- "Смысловые группы" — semantic groups of chunks that all serve the same
-- communicative function (e.g. accepting_suggestion: "sounds good", "I'm
-- in", "let's do it"). A "Ситуация" (free-text prompt or situation-comic)
-- can link to one such group so the production-check judge knows the full
-- set of phrases that legitimately answer it, not just the one chunk it was
-- originally authored for. See apps/server/src/modules/chunkGroups/ for the
-- admin CRUD + AI-assisted mass-classification code, and
-- progress/service.ts's submitProductionAnswer for how this feeds judging.
CREATE TABLE chunk_semantic_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Many-to-many: a chunk can belong to more than one group (e.g. "no
-- problem" could fit both an acceptance group and a reassurance group).
CREATE TABLE chunk_semantic_group_members (
  group_id UUID NOT NULL REFERENCES chunk_semantic_groups(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, chunk_id)
);
CREATE INDEX idx_chunk_semantic_group_members_chunk ON chunk_semantic_group_members (chunk_id);

-- Nullable — an unclassified situation just falls back to judging against
-- its own single originally-authored chunk (see buildCandidateChunks in
-- progress/service.ts), so existing content keeps working before an admin
-- gets around to classifying it.
ALTER TABLE chunk_situation_prompts ADD COLUMN expected_group_id UUID REFERENCES chunk_semantic_groups(id) ON DELETE SET NULL;
-- Only meaningful for kind='situation' rows (the learner-completed comic) —
-- ignored for kind='browse'.
ALTER TABLE chunk_dialogues ADD COLUMN expected_group_id UUID REFERENCES chunk_semantic_groups(id) ON DELETE SET NULL;
