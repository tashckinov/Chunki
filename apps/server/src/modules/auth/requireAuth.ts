import type { FastifyRequest, FastifyReply } from 'fastify';
import { extractSessionToken, getSession, type AuthenticatedSession } from './session.js';

/**
 * Shared preHandler for routes that just need "is there a valid Chunki
 * session" — collections/chunks reads don't need to know who the user is,
 * so this doesn't attach anything to the request. /api/auth/me has its own
 * inline check (it actually uses the session data), left as-is.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractSessionToken(request);
  const session = token ? await getSession(token) : null;
  if (!session) {
    reply.code(401).send({ error: 'unauthorized' });
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    session?: AuthenticatedSession;
  }
}

/**
 * Like requireAuth, but for routes that actually need to know who the user
 * is (progress tracking: every write is scoped to request.session.userId).
 * chunks/collections don't need this — they're pure content reads.
 */
export async function requireAuthenticatedSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = extractSessionToken(request);
  const session = token ? await getSession(token) : null;
  if (!session) {
    reply.code(401).send({ error: 'unauthorized' });
    return;
  }
  request.session = session;
}

/**
 * For the admin module only. Composes requireAuthenticatedSession (so
 * request.session is populated the same way) then additionally requires
 * session.isAdmin, replying 403 rather than a 401 — the caller is signed in,
 * they're just not allowed here.
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuthenticatedSession(request, reply);
  if (reply.sent) return;
  if (!request.session!.isAdmin) {
    reply.code(403).send({ error: 'forbidden' });
  }
}
