import type { FastifyBaseLogger } from 'fastify';
import { sendNotification } from 'web-push';
import { pool } from '../../db/pool.js';
import { getDailyLearningPlan } from '../program/dailyLearningPlan.js';
import { resolveEffectiveTariff } from '../subscriptionTariffs/service.js';

type Vapid = { subject: string; publicKey: string; privateKey: string };

export async function dispatchDueReminders(log: FastifyBaseLogger, vapid: Vapid) {
  // Claim each device once per local calendar day, even with multiple app instances.
  // Skip stale reminders after an outage rather than sending them hours later.
  const { rows } = await pool.query<{
    endpoint: string; p256dh: string; auth: string; user_id: string; time_zone: string; local_day: string;
  }>(`
    WITH due AS (
      SELECT endpoint, (now() AT TIME ZONE time_zone)::date AS local_day
      FROM study_reminders
      WHERE (extract(isodow FROM now() AT TIME ZONE time_zone)::int - 1) = ANY(days)
        AND last_sent_on IS DISTINCT FROM (now() AT TIME ZONE time_zone)::date
        AND (now() AT TIME ZONE time_zone) >= (now() AT TIME ZONE time_zone)::date + local_time
        AND (now() AT TIME ZONE time_zone) < (now() AT TIME ZONE time_zone)::date + local_time + interval '15 minutes'
      ORDER BY endpoint LIMIT 100 FOR UPDATE SKIP LOCKED
    )
    UPDATE study_reminders r SET last_sent_on = due.local_day
    FROM due WHERE r.endpoint = due.endpoint
    RETURNING r.endpoint, r.p256dh, r.auth, r.user_id, r.time_zone, to_char(due.local_day, 'YYYY-MM-DD') AS local_day
  `);
  await Promise.all(rows.map(async ({ endpoint, p256dh, auth, user_id, time_zone, local_day }) => {
    try {
      const tariff = await resolveEffectiveTariff(user_id);
      if (!tariff.allowProgram) return;
      const plan = await getDailyLearningPlan(user_id, time_zone);
      if (plan?.day !== local_day || !plan.steps.some(({ done }) => !done)) return;

      await sendNotification({ endpoint, keys: { p256dh, auth } }, '{}',
        { TTL: 300, timeout: 10_000, vapidDetails: vapid });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await pool.query('DELETE FROM study_reminders WHERE endpoint = $1 AND p256dh = $2 AND auth = $3',
          [endpoint, p256dh, auth]);
      } else {
        log.warn({ status }, 'Study reminder delivery failed');
      }
    }
  }));
}

export function startReminderDispatcher(log: FastifyBaseLogger, vapid: Vapid) {
  let dispatching = false;

  async function dispatch() {
    if (dispatching) return;
    dispatching = true;
    try {
      await dispatchDueReminders(log, vapid);
    } catch {
      log.warn('Study reminder dispatch could not complete');
    } finally {
      dispatching = false;
    }
  }

  const timer = setInterval(() => { void dispatch(); }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
