-- Learning collections and chunk/collocation cards.
-- A chunk (e.g. "check in", "sounds good") can appear in more than one
-- collection, so the relationship is a join table rather than a
-- collection_id column on chunks.

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  position INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Common lookup: the published list ordered by position.
CREATE INDEX idx_collections_published_position ON collections (is_published, position);

CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  translation TEXT NOT NULL,
  explanation TEXT,
  example TEXT,
  example_translation TEXT,
  level TEXT NOT NULL CHECK (level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collection <-> chunk membership and ordering.
-- ON DELETE CASCADE on both sides is intentional: deleting a collection just
-- removes that collection's memberships (chunks that also belong to other
-- collections are unaffected); deleting a chunk removes it from every
-- collection it was in (collections themselves are unaffected).
CREATE TABLE collection_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (collection_id, chunk_id)
);

CREATE INDEX idx_collection_chunks_collection_position ON collection_chunks (collection_id, position);
CREATE INDEX idx_collection_chunks_chunk_id ON collection_chunks (chunk_id);
