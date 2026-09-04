import { randomBytes, createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { pool } from '../../db/pool.js';

export const SESSION_COOKIE_NAME = 'chunki_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export interface AuthenticatedSession {
  userId: string;
  email: string | null;
  displayName: string | null;
  /** From the provider's verified profile at login time, never from the client or the users table. */
  providerImageUrl: string | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Safari blocks the cross-site `chunki_session` cookie outright (ITP blocks
 * third-party cookies unconditionally, regardless of SameSite=None) — this
 * broke Google sign-in on iOS Safari and the installed PWA. The callback now
 * also hands the token to the frontend via URL fragment, and the frontend
 * resends it as `Authorization: Bearer <token>`, which every browser sends
 * for a plain cross-origin fetch. The cookie is kept as a harmless fallback
 * for same-site (dev) deployments.
 */
export function extractSessionToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice('Bearer '.length);
  return request.cookies[SESSION_COOKIE_NAME] ?? null;
}

/**
 * Creates an opaque server-side session. The cookie only ever carries the
 * random token — Postgres stores its hash, so a database leak alone
 * doesn't hand over usable sessions. `providerImageUrl` is the minimum
 * verified provider data needed to serve it back from `/api/auth/me`; it is
 * never written to the `users` table.
 */
export async function createSession(userId: string, providerImageUrl: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await pool.query(`INSERT INTO sessions (user_id, token_hash, provider_image_url, expires_at) VALUES ($1, $2, $3, $4)`, [
    userId,
    hashToken(token),
    providerImageUrl,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function getSession(token: string): Promise<AuthenticatedSession | null> {
  const { rows } = await pool.query<{
    user_id: string;
    email: string | null;
    display_name: string | null;
    provider_image_url: string | null;
  }>(
    `SELECT u.id AS user_id, u.email, u.display_name, s.provider_image_url
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    providerImageUrl: row.provider_image_url,
  };
}

export async function destroySession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}
