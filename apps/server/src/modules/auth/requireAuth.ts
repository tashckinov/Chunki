import type { FastifyRequest, FastifyReply } from 'fastify';
import { SESSION_COOKIE_NAME, getSession } from './session.js';

/**
 * Shared preHandler for routes that just need "is there a valid Chunki
 * session" — collections/chunks reads don't need to know who the user is,
 * so this doesn't attach anything to the request. /api/auth/me has its own
 * inline check (it actually uses the session data), left as-is.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const session = token ? await getSession(token) : null;
  if (!session) {
    reply.code(401).send({ error: 'unauthorized' });
  }
}
