import type { FastifyPluginAsync } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import { loadEnv } from '../../config/env.js';
import { OpenRouterGradingProvider } from '../../grading/openrouter.js';
import { archiveGrammarTest, listGrammarTests, publishGrammarTest } from './repository.js';
import { grammarTestDefinitionSchema, grammarTestIdSchema } from './schema.js';

export const grammarTestAdminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  await app.register(rateLimit, { global: false });

  app.get('/', async () => ({ variants: await listGrammarTests() }));

  app.post('/', async (request, reply) => {
    const body = z.object({
      title: z.string().trim().min(1).max(120),
      definition: grammarTestDefinitionSchema,
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

  app.post('/generate', {
    preHandler: app.rateLimit({ max: 5, timeWindow: '10 minutes', keyGenerator: (request) => request.session!.userId }),
  }, async (request, reply) => {
    const body = z.object({ focus: z.string().trim().max(500) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_request' });
    const env = loadEnv();
    if (!env.OPENROUTER_API_KEY) return reply.code(503).send({ error: 'generation_unavailable' });
    try {
      const existing = await listGrammarTests();
      const avoid = existing.slice(0, 5).flatMap(({ definition }) => definition.mcq.map(({ q }) => q));
      const draft = await new OpenRouterGradingProvider(env).generatePlacementTest(body.data.focus, avoid);
      return { definition: grammarTestDefinitionSchema.parse(draft) };
    } catch (error) {
      request.log.error({ message: error instanceof Error ? error.message : String(error) }, 'Grammar test generation failed');
      return reply.code(502).send({ error: 'generation_failed' });
    }
  });
};
