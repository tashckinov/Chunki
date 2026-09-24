-- Real subscription payments (Lava.top, or any future provider). users.premium_until
-- already exists (0005_admin_subscription.sql) and is already enforced elsewhere
-- (progress/service.ts) — this gives it a real, provider-driven writer instead of
-- only the admin's manual PATCH.

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'lava_top',
  external_id TEXT NOT NULL,              -- the provider's invoice/contract id
  plan TEXT NOT NULL,                     -- 'monthly' | 'yearly'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'cancelled'
  amount NUMERIC,
  currency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payments_provider_external_id ON payments (provider, external_id);
CREATE INDEX idx_payments_user_id_created_at ON payments (user_id, created_at DESC);

-- Every webhook delivery, successfully processed or not — an audit trail for
-- when money is involved, mirrors ai_call_logs' shape/purpose (0006_ai_call_log.sql).
CREATE TABLE payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'lava_top',
  event_type TEXT,
  payload JSONB NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_webhook_logs_created_at ON payment_webhook_logs (created_at DESC);
