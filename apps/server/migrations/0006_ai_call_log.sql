-- Durable log of production-check judge (LLM) calls, for admin visibility
-- into what was actually sent/returned — previously only visible transiently
-- in server logs.
--
-- user_id/chunk_id use ON DELETE SET NULL (not CASCADE, unlike most other
-- FKs in this schema): a log entry is a historical record and should
-- survive the user/chunk it referenced being deleted later.
CREATE TABLE ai_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  chunk_id UUID REFERENCES chunks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT,
  request JSONB NOT NULL,
  response JSONB,
  error TEXT,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_call_logs_created_at ON ai_call_logs (created_at DESC);
