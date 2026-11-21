import type { FastifyPluginAsync } from 'fastify';
import { grammarTestDraftSchema } from '@app/shared';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import { archiveGrammarTest, listGrammarTests, publishGrammarTest } from './repository.js';
import { grammarTestIdSchema } from './schema.js';

export const grammarTestAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/', async () => ({ variants: await listGrammarTests() }));

  app.post('/', async (request, reply) => {
    const body = grammarTestDraftSchema.extend({
      replacesId: grammarTestIdSchema.optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_test' });
    const { title, definition, replacesId } = body.data;
    const variant = await publishGrammarTest(title, definition, replacesId);
    if (!variant) return reply.code(409).send({ error: 'variant_already_replaced' });
    return reply.code(201).send({ variant });
  });

  app.delete('/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_variant' });
    if (!await archiveGrammarTest(params.data.id)) return reply.code(404).send({ error: 'variant_not_found' });
    return { ok: true };
  });
};
