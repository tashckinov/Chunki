import { afterAll, expect, it, vi } from 'vitest';
import { fastify } from 'fastify';
import { sendNotification } from 'web-push';
import { pool } from '../db/pool.js';
import { dispatchDueReminders } from '../modules/reminders/dispatcher.js';
import { submitPlacementTest } from '../modules/program/service.js';
import { getDailyLearningPlan } from '../modules/program/dailyLearningPlan.js';

vi.mock('web-push', () => ({ sendNotification: vi.fn() }));
afterAll(() => pool.end());

it('sends once on a selected day and skips empty, finished and unscheduled plans', async () => {
  const app = fastify();
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (is_admin) SELECT true FROM generate_series(1, 5) RETURNING id',
  );
  const [waiting, finished, empty, unscheduled, untested] = rows;
  const prefix = 'https://fcm.googleapis.com/test-reminder/';
  try {
    for (const learner of [waiting, finished, empty, unscheduled]) {
      const placement = await submitPlacementTest(learner.id, {
        fromLevel: null, toLevel: 'B1', purpose: [], mcqAnswers: {}, open9: '', open10: '', essay: '',
      });
      if (placement.kind !== 'ok') throw new Error(placement.kind);
      expect(placement.topics.length).toBeGreaterThan(1);
    }

    const finishedPlan = await getDailyLearningPlan(finished.id, 'UTC');
    expect(finishedPlan?.steps).toHaveLength(1);
    await pool.query('UPDATE user_topics SET status = $2 WHERE id = $1', [finishedPlan!.steps[0].topic.id, 'mastered']);
    // The completed plan still has additional recommended topics available outside today.
    await pool.query('UPDATE user_topics SET withdrawn_at = now() WHERE user_id = $1', [empty.id]);

    for (const learner of rows) {
      await pool.query(`
        INSERT INTO study_reminders (endpoint, user_id, p256dh, auth, local_time, time_zone, days)
        SELECT $1, $2, 'p256dh', 'auth', (now() AT TIME ZONE 'UTC')::time, 'UTC',
          ARRAY[((extract(isodow FROM now() AT TIME ZONE 'UTC')::int - 1 + $3::int) % 7)::smallint]
      `, [prefix + learner.id, learner.id, learner === unscheduled ? 1 : 0]);
    }

    const vapid = { subject: 'mailto:test@example.com', publicKey: 'test', privateKey: 'test' };
    await dispatchDueReminders(app.log, vapid);
    await dispatchDueReminders(app.log, vapid);

    expect(sendNotification).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ endpoint: prefix + waiting.id }), '{}', expect.anything(),
    );
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [rows.map(({ id }) => id)]);
    await app.close();
  }
});
