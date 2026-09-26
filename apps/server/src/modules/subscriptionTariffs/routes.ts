import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../auth/requireAuth.js';
import { listTariffsForAdmin, createTariffForAdmin, updateTariffForAdmin, deleteTariffForAdmin } from './service.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const tariffBodySchema = z.object({
  name: z.string().min(1).max(100),
  periodicity: z.enum(['monthly', 'yearly']),
  offerUrl: z.string().max(500).nullable(),
  priceUsd: z.number().nonnegative().max(100000).nullable(),
  priceEur: z.number().nonnegative().max(100000).nullable(),
  priceRub: z.number().nonnegative().max(1000000).nullable(),
  allowCards: z.boolean(),
  allowProgram: z.boolean(),
  dailyCheckLimit: z.number().int().positive().max(10000).nullable(),
  isDefault: z.boolean(),
  position: z.number().int(),
  upsellTariffIds: z.array(z.string().uuid()).max(20),
});

/** Admin-only tariff constructor — create/edit/delete arbitrary tariffs, each with its own entitlements (deck/production-check access, program access, a daily check cap) and upsell list. See subscriptionTariffs/service.ts's resolveEffectiveTariff for how these get enforced. */
export const subscriptionTariffsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);

  app.get('/', async () => {
    return { tariffs: await listTariffsForAdmin() };
  });

  app.post('/', async (request, reply) => {
    const parsed = tariffBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const tariff = await createTariffForAdmin(parsed.data);
    return { tariff };
  });

  app.patch('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    const body = tariffBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const result = await updateTariffForAdmin(params.data.id, body.data);
    if (result.kind === 'not_found') {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { tariff: result.tariff };
  });

  app.delete('/:id', async (request, reply) => {
    const params = idParamSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: 'invalid_request' };
    }
    const removed = await deleteTariffForAdmin(params.data.id);
    if (!removed) {
      reply.code(404);
      return { error: 'not_found' };
    }
    return { ok: true };
  });
};
