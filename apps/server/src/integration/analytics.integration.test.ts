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

it('aggregates multiple lessons by the captured objective without reassigning old events after a relink', async () => {
  const { objectiveReport } = await import('../modules/analytics/objectives.js');
  const { rows: [learner] } = await pool.query<{ id: string }>('INSERT INTO users DEFAULT VALUES RETURNING id');
  const keys = [randomUUID(), randomUUID(), randomUUID()];
  const objective = 'a2-articles';
  const otherObjective = 'a2-past-continuous';
  try {
    for (const [index, key] of keys.entries()) {
      await pool.query(`INSERT INTO program_topics (key,title,category,level,curriculum_id)
        VALUES ($1,$2,'Грамматика','A2',$3)`, [key, 'Тестовый урок ' + key, index < 2 ? objective : null]);
      const { rows: [assignment] } = await pool.query<{ id: string }>(
        `INSERT INTO user_topics (user_id,key,catalog_key,title,category,rationale,source)
         VALUES ($1,$2,$2,$2,'Грамматика','','placement') RETURNING id`, [learner.id, key],
      );
      await recordClientEvents(learner.id, [{ name: 'topic_study_started', id: randomUUID(),
        at: new Date(Date.now() + 10).toISOString(), contentId: assignment.id }]);
      await pool.query(`INSERT INTO topic_attempts (user_topic_id,kind,items,graded_at,passed,score_out_of_10)
        VALUES ($1,$2,'[]',now(),true,10)`, [assignment.id, index === 1 ? 'reconfirm' : 'initial']);
    }
    await pool.query('UPDATE program_topics SET curriculum_id = $2 WHERE key = $1', [keys[0], otherObjective]);
    const report = await objectiveReport(7, 'Europe/Moscow');
    const original = report.objectives.find(({ id }) => id === objective);
    expect(original.metrics).toMatchObject({
      assignments: 2, assigned_users: 1, started_users: 1, checks: 2, passed_users: 1, mastered_users: 1,
      recommended_checks: 1, review_checks: 1,
    });
    expect(original.lessons).toContainEqual(expect.objectContaining({
      id: keys[0], current: false, metrics: expect.objectContaining({ checks: 1 }),
    }));
    expect(report.objectives.find(({ id }) => id === otherObjective).metrics).toBeNull();
    const timeline = await activityTimeline({ days: 7, zone: 'Europe/Moscow', user: learner.id, name: 'topic_check_completed', offset: 0 });
    expect(timeline.rows).toHaveLength(3);
    expect(timeline.rows.filter(({ curriculum_objective_id }) => curriculum_objective_id === objective)).toHaveLength(2);
    expect(timeline.rows.find(({ content_id }) => content_id === keys[2]).curriculum_objective_id).toBeNull();
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [learner.id]);
    await pool.query('DELETE FROM program_topics WHERE key = ANY($1)', [keys]);
  }
});

it('distinguishes saved placement attempts from observed starts and uses local calendar boundaries', async () => {
  const { rows: [learner] } = await pool.query<{ id: string }>(
    "INSERT INTO users (created_at) VALUES (now() - interval '2 days') RETURNING id",
  );
  try {
    const before = await analyticsReport(7, 'Europe/Moscow');
    await pool.query(`
      INSERT INTO placement_tests (user_id, to_level, overall_level, mcq_answers, open9, open10, essay,
        skills, above_level, below_level, mcq_score, open_grades, essay_grade)
      SELECT $1, 'B1', 'A2', '{}', '', '', '', '[]', '', '', '{}', '{}', '{}'
      FROM generate_series(1, 2)
    `, [learner.id]);
    const report = await analyticsReport(7, 'Europe/Moscow');
    const count = (r: typeof report, name: string) => r.events.filter((row) => row.name === name).reduce((n, row) => n + row.events, 0);
    expect(count(report, 'placement_completed') - count(before, 'placement_completed')).toBe(2);
    expect(count(report, 'placement_started') - count(before, 'placement_started')).toBe(0);
    expect(report.cohort.tested - before.cohort.tested).toBe(1);
    expect(report.cohort.started - before.cohort.started).toBe(1);
    expect(report.cohort.observed_starts - before.cohort.observed_starts).toBe(0);

    await pool.query(`
      INSERT INTO product_events (user_id,event_id,name,occurred_at,source)
      VALUES ($1, gen_random_uuid(), 'app_opened',
        ((now() AT TIME ZONE 'Europe/Moscow')::date::timestamp AT TIME ZONE 'Europe/Moscow') - interval '1 millisecond', 'client')
    `, [learner.id]);
    const base = { zone: 'Europe/Moscow', user: learner.id, name: 'app_opened', offset: 0 };
    expect((await activityTimeline({ ...base, days: 1 })).rows).toHaveLength(0);
    expect((await activityTimeline({ ...base, days: 2 })).rows).toHaveLength(1);
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [learner.id]);
  }
});
