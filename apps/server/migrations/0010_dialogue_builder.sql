-- "Chanki" mini-comic/dialogue builder. Phase 1 (Character Manager) only
-- writes to characters/character_images; chunk_dialogues/participants/
-- messages are created now too so the schema is final before Phase 2.

-- Global character library — shared across every collection/chunk.
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  full_body_image_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per uploaded emotion image. `emotion` is a plain text label, not
-- a separate entity — multiple rows can share the same emotion value, which
-- is exactly "an emotion can have several image variants" from the spec.
CREATE TABLE character_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  emotion TEXT NOT NULL,
  image_url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_character_images_character_emotion ON character_images (character_id, emotion, position);

-- At most one dialogue per chunk.
CREATE TABLE chunk_dialogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES chunks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which characters appear in a dialogue and which side they're locked to.
-- Side lives here (scene-level), not per message, so changing a character's
-- side is a single row update rather than a bulk rewrite of their messages.
CREATE TABLE chunk_dialogue_participants (
  dialogue_id UUID NOT NULL REFERENCES chunk_dialogues(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  PRIMARY KEY (dialogue_id, character_id)
);

-- One row per line of dialogue, in order.
-- character_image_id is ON DELETE RESTRICT (not CASCADE): deleting an
-- emotion-image variant that's actually used by an existing message should
-- fail loudly (admin must replace it there first) rather than silently
-- leaving a message with a dangling image reference.
CREATE TABLE chunk_dialogue_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogue_id UUID NOT NULL REFERENCES chunk_dialogues(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  character_image_id UUID NOT NULL REFERENCES character_images(id) ON DELETE RESTRICT,
  text TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunk_dialogue_messages_dialogue_position ON chunk_dialogue_messages (dialogue_id, position);
