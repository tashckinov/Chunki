CREATE TABLE subscription_timecodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  tariff_id UUID REFERENCES subscription_tariffs(id) ON DELETE SET NULL,
  months INTEGER NOT NULL CHECK (months BETWEEN 1 AND 120),
  max_uses INTEGER NOT NULL CHECK (max_uses BETWEEN 1 AND 10000),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count BETWEEN 0 AND max_uses),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscription_timecode_redemptions (
  timecode_id UUID NOT NULL REFERENCES subscription_timecodes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  premium_until TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (timecode_id, user_id)
);
