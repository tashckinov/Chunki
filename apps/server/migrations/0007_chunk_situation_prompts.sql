-- Multiple situation prompts per chunk instead of a single scalar column —
-- the admin can attach an unlimited number, and the app cycles through them
-- round-robin (see progress/service.ts) rather than always showing the same
-- one. ON DELETE CASCADE: prompts have no meaning detached from their chunk.
CREATE TABLE chunk_situation_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_situation_prompts_chunk_position ON chunk_situation_prompts (chunk_id, position);

-- Backfill existing single-prompt data as each chunk's first (only) prompt.
INSERT INTO chunk_situation_prompts (chunk_id, prompt, position)
SELECT id, situation_prompt, 0 FROM chunks WHERE situation_prompt IS NOT NULL AND situation_prompt <> '';

ALTER TABLE chunks DROP COLUMN situation_prompt;
