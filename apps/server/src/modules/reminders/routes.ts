import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireAuthenticatedSession } from '../auth/requireAuth.js';

const endpoint = z.string().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash
      && (host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
        || host === 'web.push.apple.com' || host.endsWith('.push.apple.com')
        || host.endsWith('.notify.windows.com'));
  } catch {
    return false;
  }
});
const deviceSchema = z.object({ endpoint });
const reminderSchema = deviceSchema.extend({
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: z.string().max(100).regex(/^[A-Za-z0-9_+/-]+$/).refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});

export const reminderRoutes: FastifyPluginAsync<{ publicKey?: string }> = async (app, { publicKey }) => {
  app.addHook('preHandler', requireAuthenticatedSession);
  app.get('/config', async () => ({ publicKey: publicKey ?? null }));

  app.post('/status', async (request, reply) => {
    const body = deviceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_subscription' });
    const { rows } = await pool.query<{ time: string }>(
      "SELECT to_char(local_time, 'HH24:MI') AS time FROM study_reminders WHERE user_id = $1 AND endpoint = $2",
      [request.session!.userId, body.data.endpoint],
    );
    return { time: rows[0]?.time ?? null };
  });

  app.post('/', async (request, reply) => {
    if (!publicKey) return reply.code(503).send({ error: 'reminders_unavailable' });
    const body = reminderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_reminder' });
    const { endpoint: url, keys, time, timeZone } = body.data;
    // Use the database's time-zone catalogue since scheduling happens in SQL.
    const zone = await pool.query('SELECT 1 FROM pg_timezone_names WHERE name = $1', [timeZone]);
    if (!zone.rowCount) return reply.code(400).send({ error: 'invalid_time_zone' });

    await pool.query(
      `INSERT INTO study_reminders (endpoint, user_id, p256dh, auth, local_time, time_zone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         local_time = EXCLUDED.local_time, time_zone = EXCLUDED.time_zone`,
      [url, request.session!.userId, keys.p256dh, keys.auth, time, timeZone],
    );
    return { ok: true };
  });

  app.post('/disable', async (request, reply) => {
    const body = deviceSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_subscription' });
    await pool.query('DELETE FROM study_reminders WHERE user_id = $1 AND endpoint = $2',
      [request.session!.userId, body.data.endpoint]);
    return { ok: true };
  });
};
