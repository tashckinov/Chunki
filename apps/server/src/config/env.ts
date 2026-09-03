import { z } from 'zod';

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

  // Existing grading config (unrelated to auth), kept as-is.
  GRADING_PROVIDER: z.enum(['mock', 'anthropic']).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
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
