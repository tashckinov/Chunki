import { fastify } from 'fastify';
import { afterAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import { createSession } from '../modules/auth/session.js';
import { pool } from '../db/pool.js';
import { recordClientEvents } from '../modules/analytics/events.js';
import { analyticsReport, activityTimeline } from '../modules/analytics/report.js';
import { adminAnalyticsRoutes, analyticsRoutes } from '../modules/analytics/routes.js';

afterAll(() => pool.end());

it('deduplicates retries and separates starts, completions and unique learners', async () => {
  const { rows: [user] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  try {
    const before = await analyticsReport(7, 'Europe/Moscow');
    const journeyId = randomUUID();
    const at = new Date().toISOString();
    const events = [
      { id: randomUUID(), name: 'comic_opened', at, journeyId, contentId: randomUUID() },
      { id: randomUUID(), name: 'comic_completed', at, journeyId },
    ] as const;
    await Promise.all([recordClientEvents(user.id, [...events]), recordClientEvents(user.id, [...events])]);
    const timeline = await activityTimeline({ days: 7, zone: 'Europe/Moscow', user: user.id, offset: 0 });
    expect(timeline.rows.map(({ name }) => name).sort()).toEqual(['comic_completed', 'comic_opened', 'registered']);
    const report = await analyticsReport(7, 'Europe/Moscow');
    expect(report.totals.learning_actions - before.totals.learning_actions).toBe(1);
    expect(report.cohort.activated - before.cohort.activated).toBe(1);
    expect(report.completion).toContainEqual({ name: 'comic_opened', started: 1, finished: 1 });
    expect((await activityTimeline({ days: 7, zone: 'Europe/Moscow', user: user.id, name: 'comic_opened', offset: 0 })).rows).toHaveLength(1);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
  }
});

it('requires authentication for event intake and administrative reports', async () => {
  const app = fastify();
  const { rows: [user, admin] } = await pool.query<{ id: string }>(
    'INSERT INTO users (is_admin) VALUES (false), (true) RETURNING id',
  );
  try {
    await app.register(cookie);
    await app.register(analyticsRoutes, { prefix: '/api/analytics' });
    await app.register(adminAnalyticsRoutes, { prefix: '/api/admin/analytics' });
    expect((await app.inject({ method: 'POST', url: '/api/analytics/events', payload: [] })).statusCode).toBe(401);
    expect((await app.inject('/api/admin/analytics')).statusCode).toBe(401);
    const regularSession = await createSession(user.id, null);
    const adminSession = await createSession(admin.id, null);
    const headers = { authorization: 'Bearer ' + regularSession.token };
    expect((await app.inject({ url: '/api/admin/analytics', headers })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/admin/analytics', headers: { authorization: 'Bearer ' + adminSession.token } })).statusCode).toBe(200);
    const { rows: [delivery] } = await pool.query<{ id: string }>(
      'INSERT INTO notification_deliveries (user_id, scheduled_at, accepted_at) VALUES ($1, now(), now()) RETURNING id', [user.id],
    );
    const click = { method: 'POST', url: '/api/analytics/notification-click', payload: { id: delivery.id } } as const;
    await app.inject({ ...click, headers: { authorization: 'Bearer ' + adminSession.token } });
    expect((await activityTimeline({ days: 7, zone: 'Europe/Moscow', user: user.id, name: 'notification_clicked', offset: 0 })).rows).toHaveLength(0);
    await app.inject({ ...click, headers });
    await app.inject({ ...click, headers });
    expect((await activityTimeline({ days: 7, zone: 'Europe/Moscow', user: user.id, name: 'notification_clicked', offset: 0 })).rows).toHaveLength(1);
  } finally {
    await app.close();
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[user.id, admin.id]]);
  }
});
