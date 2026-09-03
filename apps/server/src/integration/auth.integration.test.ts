// Integration tests against a REAL Postgres — run with `npm run test:integration`
// after `docker compose up -d postgres` and running migrations (see README).
// Not part of the default `npm test` run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../db/pool.js';
import { findOrCreateUserFromProvider } from '../modules/users/service.js';
import { createSession, getSession, destroySession } from '../modules/auth/session.js';

function uniqueProviderUserId() {
  return `integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

afterAll(async () => {
  await pool.end();
});

describe('users table schema', () => {
  it('has no image/avatar column — the picture URL is never persisted', async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
    );
    const columnNames = rows.map((r) => r.column_name);
    const suspicious = columnNames.filter((name) => /image|avatar|photo|picture/i.test(name));
    expect(suspicious).toEqual([]);
  });
});

describe('findOrCreateUserFromProvider (real database)', () => {
  it('creates then reuses a user for the same provider identity', async () => {
    const providerUserId = uniqueProviderUserId();
    const profile = {
      provider: 'google',
      providerUserId,
      email: `${providerUserId}@example.com`,
      displayName: 'Integration Test User',
      providerEmail: `${providerUserId}@example.com`,
    };

    const first = await findOrCreateUserFromProvider(profile);
    const second = await findOrCreateUserFromProvider(profile);

    expect(second.id).toBe(first.id);
    expect(second.last_login_at.getTime()).toBeGreaterThanOrEqual(first.last_login_at.getTime());

    const { rows } = await pool.query('SELECT count(*)::int AS count FROM auth_identities WHERE provider_user_id = $1', [
      providerUserId,
    ]);
    expect(rows[0].count).toBe(1);
  });

  it('resolves concurrent first-time logins for the same identity to one user', async () => {
    const providerUserId = uniqueProviderUserId();
    const profile = {
      provider: 'google',
      providerUserId,
      email: `${providerUserId}@example.com`,
      displayName: 'Race Test User',
      providerEmail: `${providerUserId}@example.com`,
    };

    const [a, b] = await Promise.all([findOrCreateUserFromProvider(profile), findOrCreateUserFromProvider(profile)]);

    expect(a.id).toBe(b.id);
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM users WHERE id = $1', [a.id]);
    expect(rows[0].count).toBe(1);
  });
});

describe('sessions (real database)', () => {
  it('creates, reads, and destroys an opaque session', async () => {
    const profile = {
      provider: 'google',
      providerUserId: uniqueProviderUserId(),
      email: null,
      displayName: null,
      providerEmail: null,
    };
    const user = await findOrCreateUserFromProvider(profile);

    const { token } = await createSession(user.id, 'https://lh3.googleusercontent.com/verified-pic');

    const session = await getSession(token);
    expect(session?.userId).toBe(user.id);
    expect(session?.providerImageUrl).toBe('https://lh3.googleusercontent.com/verified-pic');

    await destroySession(token);
    expect(await getSession(token)).toBeNull();
  });
});
