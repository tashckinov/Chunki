import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/requireAuth.js';
import { getChunkById } from './service.js';

// Pre-validated as a UUID so a malformed id never reaches Postgres (which
// would otherwise throw a raw "invalid input syntax for type uuid" error) —
// it's just treated as not found, same as a well-formed id with no match.
const chunkIdParamSchema = z.object({ id: z.string().uuid() });

export const chunksRoutes: FastifyPluginAsync = async (app) => {
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
};
