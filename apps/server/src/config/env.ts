import { z } from 'zod';

// Some deployment setups (e.g. this repo's docker-compose.yml, which always
// sets a key even when its .env value is unset) pass unset optional vars
// through as an empty string rather than omitting them. Treat "" the same
// as "not provided" so that doesn't trip up z.enum(...).optional() below.
const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val);

// Validated once at startup. Any missing/invalid required variable throws
// immediately with a readable message instead of letting the app boot into
// a broken or insecure state.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_REDIRECT_URI: z.string().url('GOOGLE_REDIRECT_URI must be a valid URL'),

  // Used to sign the short-lived OAuth state/nonce/PKCE cookie (not the
  // session cookie itself, which is an opaque random token looked up in
  // Postgres). Kept as one variable since it's the project's one auth secret.
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),

  // Existing grading config (unrelated to auth), kept as-is. The model
  // default lives here (not as a `||` fallback in grading/anthropic.ts) so
  // every provider's default model is discoverable in one place.
  GRADING_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'anthropic']).optional()),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().default('claude-sonnet-5')),

  // Chunk production-check judge — same optional/auto-select shape as the
  // grading vars above, via OpenRouter instead of Anthropic directly.
  PRODUCTION_JUDGE_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'openrouter']).optional()),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.preprocess(emptyToUndefined, z.string().default('openai/gpt-4o-mini')),

  // Subscription payments via Lava.top — same optional explicit-override /
  // auto-select-when-a-key-is-present shape as the providers above (see
  // modules/payments/index.ts). offer ids are per-plan because Lava.top
  // models each price as its own "offer" under one product, configured in
  // its dashboard, not something this app can create via API.
  PAYMENT_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['mock', 'lava_top']).optional()),
  LAVA_TOP_API_KEY: z.string().optional(),
  // preprocess needed here (unlike the plain .optional() strings around it)
  // because .url().default(...) only substitutes the default for `undefined`
  // — an empty string (what an unset var arrives as via docker-compose)
  // would otherwise fail .url() validation instead of falling through to it.
  LAVA_TOP_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().default('https://gate.lava.top')),
  LAVA_TOP_OFFER_ID_MONTHLY: z.string().optional(),
  LAVA_TOP_OFFER_ID_YEARLY: z.string().optional(),
  // Verifies inbound webhook calls (HTTP Basic auth, configured to match in
  // Lava.top's dashboard under Интеграции → Webhook) — not the same secret
  // as LAVA_TOP_API_KEY, which is used for this app's outbound calls.
  LAVA_TOP_WEBHOOK_LOGIN: z.string().optional(),
  LAVA_TOP_WEBHOOK_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
