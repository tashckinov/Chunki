-- Editable subscription-plan config (offer link + display prices), managed
-- from the admin "Платежи" page instead of env vars (LAVA_TOP_OFFER_ID_*
-- used to hold the offer link; that's gone now — see provider.ts). One row
-- per plan, seeded so the app always has both without a first-run step.
CREATE TABLE payment_plans (
  plan TEXT PRIMARY KEY CHECK (plan IN ('monthly', 'yearly')),
  title TEXT NOT NULL,
  offer_url TEXT,
  price_usd NUMERIC(10, 2),
  price_eur NUMERIC(10, 2),
  price_rub NUMERIC(10, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payment_plans (plan, title) VALUES
  ('monthly', 'Месяц'),
  ('yearly', 'Год');
