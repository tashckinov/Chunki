CREATE TABLE grammar_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  definition JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE placement_tests ADD COLUMN variant_id UUID REFERENCES grammar_test_variants(id);
