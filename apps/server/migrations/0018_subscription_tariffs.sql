-- Full "tariff constructor": replaces the fixed two-row payment_plans model
-- (0015/0016-era: just monthly/yearly, admin only edited name/price) with an
-- arbitrary number of admin-created tariffs, each with its own entitlements
-- (deck/production-check access, program-generation access, a daily
-- production-check cap) and its own upsell list to show once that cap is
-- hit. See apps/server/src/modules/subscriptionTariffs/ for the code side.

CREATE TABLE subscription_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  periodicity TEXT NOT NULL CHECK (periodicity IN ('monthly', 'yearly')),
  offer_url TEXT,
  price_usd NUMERIC(10, 2),
  price_eur NUMERIC(10, 2),
  price_rub NUMERIC(10, 2),
  allow_cards BOOLEAN NOT NULL DEFAULT true,
  allow_program BOOLEAN NOT NULL DEFAULT true,
  -- NULL = unlimited. Applies to production-check submissions specifically
  -- (recognition/sort review was always free and stays that way).
  daily_check_limit INTEGER,
  -- Auto-assigned to a signed-up user with no paid tariff, and what a paid
  -- tariff's holder falls back to once premium_until lapses. Enforced as
  -- "at most one" in application code (subscriptionTariffs/service.ts), not
  -- a DB constraint — a partial unique index on a boolean is awkward across
  -- the row-delete/insert flows the admin CRUD does.
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which other tariffs to suggest once daily_check_limit is hit (or
-- allow_cards/allow_program is false) — admin-ordered per tariff.
CREATE TABLE subscription_tariff_upsells (
  tariff_id UUID NOT NULL REFERENCES subscription_tariffs(id) ON DELETE CASCADE,
  upsell_tariff_id UUID NOT NULL REFERENCES subscription_tariffs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tariff_id, upsell_tariff_id)
);

-- Seed from whatever payment_plans already had (title/offer_url/prices),
-- as unlimited-everything tariffs — matches current behavior exactly
-- (premium today means "unlimited production checks, cards and program
-- both already unconditionally available").
INSERT INTO subscription_tariffs (name, periodicity, offer_url, price_usd, price_eur, price_rub, allow_cards, allow_program, daily_check_limit, is_default, position)
SELECT title, plan, offer_url, price_usd, price_eur, price_rub, true, true, NULL, false,
       CASE plan WHEN 'monthly' THEN 0 ELSE 1 END
FROM payment_plans;

-- A free/default tariff always exists so a fresh signup and an expired
-- subscriber both resolve to something real. 3/day matches the old
-- FREE_PRODUCTION_CHECKS_LIMIT — the difference is this now resets daily
-- instead of being a lifetime cap, per the new daily-limit model.
INSERT INTO subscription_tariffs (name, periodicity, offer_url, allow_cards, allow_program, daily_check_limit, is_default, position)
VALUES ('Бесплатный', 'monthly', NULL, true, true, 3, true, -1);

ALTER TABLE users ADD COLUMN current_tariff_id UUID REFERENCES subscription_tariffs(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN daily_checks_used INTEGER NOT NULL DEFAULT 0;
-- The UTC calendar day daily_checks_used corresponds to — a mismatch with
-- today's UTC date means the count is stale and reads as 0 without a write.
ALTER TABLE users ADD COLUMN daily_checks_date DATE;

-- Best-effort backfill: a currently-premium user's most recent paid payment
-- tells us which periodicity they bought, matched to the corresponding
-- migrated tariff above (unambiguous right now — only one tariff exists per
-- periodicity at migration time).
UPDATE users u
SET current_tariff_id = (
  SELECT t.id FROM payments p
  JOIN subscription_tariffs t ON t.periodicity = p.plan AND t.is_default = false
  WHERE p.user_id = u.id AND p.status = 'paid'
  ORDER BY p.created_at DESC
  LIMIT 1
)
WHERE u.premium_until IS NOT NULL AND u.premium_until > now();

ALTER TABLE payments ADD COLUMN tariff_id UUID REFERENCES subscription_tariffs(id) ON DELETE SET NULL;
UPDATE payments p
SET tariff_id = (SELECT t.id FROM subscription_tariffs t WHERE t.periodicity = p.plan AND t.is_default = false ORDER BY t.created_at LIMIT 1);

ALTER TABLE users DROP COLUMN production_checks_used;
DROP TABLE payment_plans;
