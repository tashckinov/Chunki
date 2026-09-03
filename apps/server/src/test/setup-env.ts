// Fake-but-valid config so `loadEnv()` succeeds during unit tests. Nothing
// here ever talks to a real database or to Google — the modules that would
// (db/pool.ts, modules/auth/google.ts) are mocked out where a test's import
// chain would otherwise reach them.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI ??= 'http://localhost:8787/api/auth/google/callback';
process.env.SESSION_SECRET ??= 'test-session-secret-that-is-long-enough';
process.env.FRONTEND_URL ??= 'http://localhost:5173';
