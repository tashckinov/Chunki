-- Ordered, tappable parts for each situation prompt — mirrors
-- chunk_sentence_parts exactly, so the "Ситуация" text on the
-- production-check screen can offer the same tap-a-part-to-see-an-
-- explanation interaction already shipped for example sentences.
-- ON DELETE CASCADE: parts have no meaning detached from their prompt.
CREATE TABLE chunk_situation_prompt_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  situation_prompt_id UUID NOT NULL REFERENCES chunk_situation_prompts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  explanation_ru TEXT NOT NULL,
  explanation_en TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_situation_prompt_parts_prompt_position ON chunk_situation_prompt_parts (situation_prompt_id, position);
