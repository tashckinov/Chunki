-- One row per registered passkey — the identity/lookup table for this auth
-- method, analogous to auth_identities for OAuth providers but keyed by
-- credential_id (assigned by the authenticator) instead of
-- (provider, provider_user_id). Kept separate from auth_identities:
-- passkey accounts have no email/provider_email concept, and this table
-- carries WebAuthn-specific fields auth_identities has no room for.
CREATE TABLE webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[],
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
