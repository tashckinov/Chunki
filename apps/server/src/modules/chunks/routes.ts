import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { getChunkById } from './service.js';
import { findLearnerDialogue, findRandomLearnerDialogue } from '../dialogues/service.js';

// Pre-validated as a UUID so a malformed id never reaches Postgres (which
// would otherwise throw a raw "invalid input syntax for type uuid" error) —
// it's just treated as not found, same as a well-formed id with no match.
const chunkIdParamSchema = z.object({ id: z.string().uuid() });

export const chunksRoutes: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, { global: false });

  // Public — no session yet, so IP-keyed like the other anonymous-hittable
  // routes (auth/routes.ts, payments webhook). Backs the guest gallery
  // preview; registered as a static path, so it never collides with the
  // /:id param route below regardless of order. A library with no
  // browse-kind dialogues yet is a normal `null` response, same convention
  // as GET /:id/dialogue below — not a 404.
  app.get('/random-dialogue', { preHandler: app.rateLimit({ max: 30, timeWindow: '1 minute', keyGenerator: (request) => request.ip }) }, async () => {
    return { dialogue: await findRandomLearnerDialogue() };
  });

  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = chunkIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404);
      return { error: 'not_found' };
    }

    const chunk = await getChunkById(parsed.data.id);
    if (!chunk) {
      reply.code(404);
      return { error: 'not_found' };
    }

    return { chunk };
  });

  // A chunk without a dialogue is the common case — `null` is a normal
  // response, not a 404.
  app.get('/:id/dialogue', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = chunkIdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { dialogue: await findLearnerDialogue(parsed.data.id) };
  });
};
