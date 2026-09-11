-- A chunk can now have two independent comics: the existing passive one
-- shown on "Не знаю" (kind='browse', unchanged behavior) and a new one for
-- "Ситуация" (kind='situation') whose last message the learner fills in
-- themselves instead of reading it.

-- Drop whatever the auto-generated UNIQUE constraint on chunk_id is named
-- (Postgres's default naming convention gives it chunk_dialogues_chunk_id_key,
-- but this looks it up rather than assuming) before replacing it with a
-- per-kind uniqueness rule.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  WHERE con.conrelid = 'chunk_dialogues'::regclass
    AND con.contype = 'u'
    AND con.conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'chunk_dialogues'::regclass AND attname = 'chunk_id'
    )];
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chunk_dialogues DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE chunk_dialogues ADD COLUMN kind TEXT NOT NULL DEFAULT 'browse' CHECK (kind IN ('browse', 'situation'));
ALTER TABLE chunk_dialogues ADD CONSTRAINT chunk_dialogues_chunk_id_kind_key UNIQUE (chunk_id, kind);

-- At most one message per dialogue may be the learner-filled blank (enforced
-- here at the DB level; app code additionally requires it to be the last
-- message by position — see dialogues/repository.ts's referencesAreValid).
ALTER TABLE chunk_dialogue_messages ADD COLUMN is_blank BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_chunk_dialogue_messages_one_blank ON chunk_dialogue_messages (dialogue_id) WHERE is_blank;
