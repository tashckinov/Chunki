ALTER TABLE subscription_tariffs
  ADD COLUMN monthly_placement_limit INTEGER DEFAULT 4 CHECK (monthly_placement_limit BETWEEN 0 AND 10000);

UPDATE subscription_tariffs SET monthly_placement_limit = 1 WHERE is_default;

CREATE TABLE placement_test_checks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL
);
