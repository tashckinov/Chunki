import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireAdmin, requireAuthenticatedSession } from '../auth/requireAuth.js';
import { clientEvent, recordClientEvents } from './events.js';
import { analyticsReport, activityTimeline } from './report.js';
import { objectiveReport } from './objectives.js';

export const analyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuthenticatedSession);
  app.post('/events', async (request, reply) => {
    const input = z.array(clientEvent).min(1).max(25).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_events' });
    await recordClientEvents(request.session!.userId, input.data);
    return { ok: true };
  });
  app.post('/notification-click', async (request, reply) => {
    const input = z.object({ id: z.string().uuid() }).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: 'invalid_delivery' });
    await pool.query(`UPDATE notification_deliveries SET clicked_at = now()
      WHERE id = $1 AND user_id = $2 AND clicked_at IS NULL`, [input.data.id, request.session!.userId]);
    return { ok: true };
  });
};

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  zone: z.string().max(64).refine((zone) => {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
  }).default('Europe/Moscow'),
});
export const adminAnalyticsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.get('/', async (request, reply) => {
    const input = querySchema.safeParse(request.query);
    if (!input.success) return reply.code(400).send({ error: 'invalid_period' });
    return analyticsReport(input.data.days, input.data.zone);
  });
  app.get('/objectives', async (request, reply) => {
    const input = querySchema.safeParse(request.query);
    if (!input.success) return reply.code(400).send({ error: 'invalid_period' });
    return objectiveReport(input.data.days, input.data.zone);
  });
  app.get('/activity', async (request, reply) => {
    const input = querySchema.extend({
      user: z.string().trim().max(150).optional(),
      name: z.string().max(80).optional(),
      content: z.string().max(120).optional(),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    }).safeParse(request.query);
    if (!input.success) return reply.code(400).send({ error: 'invalid_filter' });
    return activityTimeline(input.data);
  });
};
