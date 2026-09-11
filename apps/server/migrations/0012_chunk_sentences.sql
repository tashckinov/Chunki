-- Multiple example sentences per chunk (previously a single example/
-- example_translation column), each broken into ordered, tappable parts —
-- a learner flipping a deck card can tap a specific part of the sentence
-- and see a contextual explanation of just that phrase, instead of only a
-- blanket translation of the whole sentence. ON DELETE CASCADE at both
-- levels: sentences/parts have no meaning detached from their chunk.
CREATE TABLE chunk_sentences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  translation TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_sentences_chunk_position ON chunk_sentences (chunk_id, position);

CREATE TABLE chunk_sentence_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sentence_id UUID NOT NULL REFERENCES chunk_sentences(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  explanation_ru TEXT NOT NULL,
  explanation_en TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_sentence_parts_sentence_position ON chunk_sentence_parts (sentence_id, position);

-- Backfill: each chunk's existing flat example becomes one sentence with
-- zero parts (a real per-part explanation can only come from an admin or
-- the new AI-assisted flow, never fabricated during a migration).
INSERT INTO chunk_sentences (chunk_id, text, translation, position)
SELECT id, example, COALESCE(example_translation, ''), 0
FROM chunks WHERE example IS NOT NULL AND example <> '';

ALTER TABLE chunks DROP COLUMN example;
ALTER TABLE chunks DROP COLUMN example_translation;
