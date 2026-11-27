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
      expect.objectContaining({ endpoint: prefix + waiting.id }), expect.stringContaining('deliveryId'), expect.anything(),
    );
    const accepted = await pool.query(
      'SELECT user_id, attempted_at, accepted_at, failed_at, clicked_at FROM notification_deliveries WHERE user_id = ANY($1::uuid[])',
      [rows.map(({ id }) => id)],
    );
    expect(accepted.rows).toEqual([{
      user_id: waiting.id, attempted_at: expect.any(Date), accepted_at: expect.any(Date), failed_at: null, clicked_at: null,
    }]);

    // A repeat save does not create another opt-in. A changed schedule does.
    await pool.query('UPDATE study_reminders SET days = days, local_time = local_time WHERE user_id = $1', [waiting.id]);
    await pool.query("UPDATE study_reminders SET local_time = local_time + interval '1 minute' WHERE user_id = $1", [waiting.id]);
    const events = await pool.query('SELECT name FROM product_events WHERE user_id = $1 ORDER BY occurred_at', [waiting.id]);
    expect(events.rows).toEqual([{ name: 'reminder_enabled' }, { name: 'reminder_schedule_changed' }]);

    await pool.query(`UPDATE study_reminders SET last_sent_on = NULL, local_time = (now() AT TIME ZONE 'UTC')::time
      WHERE user_id = $1`, [waiting.id]);
    vi.mocked(sendNotification).mockRejectedValueOnce({ statusCode: 410 });
    await dispatchDueReminders(app.log, vapid);
    const failed = await pool.query(
      'SELECT failed_at, failure_code, accepted_at FROM notification_deliveries WHERE user_id = $1 AND failed_at IS NOT NULL',
      [waiting.id],
    );
    expect(failed.rows).toEqual([{ failed_at: expect.any(Date), failure_code: '410', accepted_at: null }]);
    expect((await pool.query('SELECT 1 FROM study_reminders WHERE user_id = $1', [waiting.id])).rowCount).toBe(0);
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [rows.map(({ id }) => id)]);
    await app.close();
  }
});
