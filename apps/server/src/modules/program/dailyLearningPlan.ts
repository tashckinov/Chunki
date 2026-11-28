import { resolveEffectiveTariff } from '../subscriptionTariffs/service.js';
import { pool } from '../../db/pool.js';
import { getProgramForUser } from './service.js';

export async function getDailyLearningPlan(userId: string, timeZone: string) {
  const day = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone }).format(new Date());
  if (!(await resolveEffectiveTariff(userId)).allowProgram) return null;
  const program = await getProgramForUser(userId);
  if (program.status !== 'active' || !program.placement.history.length || program.needsProgramBuild) return null;

  const topics = new Map(program.topics.map((topic) => [topic.id, topic]));
  const recommended = program.topics.filter(({ source }) => source !== 'self');
  const now = Date.now();
  const reviews = recommended.flatMap((topic) => {
    const dueAt = topic.nextReviewAt ? Date.parse(topic.nextReviewAt) : NaN;
    return topic.status === 'passed_once' && dueAt <= now ? [{ id: topic.id, dueAt }] : [];
  }).sort((a, b) => a.dueAt - b.dueAt);
  const newTopic = recommended.find(({ status }) => status === 'assigned');
  await pool.query(
    `INSERT INTO daily_learning_plans (user_id, day, review_ids, new_topic_id, time_zone)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, day) DO NOTHING`,
    [userId, day, reviews.map(({ id }) => id), newTopic?.id ?? null, timeZone],
  );
  const { rows } = await pool.query<{ id: string; kind: 'review' | 'new'; done: boolean }>(
    `SELECT step.id, step.kind, EXISTS (
       SELECT 1 FROM topic_attempts a
       WHERE a.user_topic_id = step.id AND a.graded_at >= p.created_at
         AND a.kind = CASE WHEN step.kind = 'review' THEN 'reconfirm' ELSE 'initial' END
     ) AS done
     FROM daily_learning_plans p
     CROSS JOIN LATERAL (
       SELECT r.id, 'review' AS kind, r.position FROM unnest(p.review_ids) WITH ORDINALITY r(id, position)
       UNION ALL SELECT p.new_topic_id, 'new', cardinality(p.review_ids) + 1 WHERE p.new_topic_id IS NOT NULL
     ) step
     WHERE p.user_id = $1 AND p.day = $2 ORDER BY step.position`,
    [userId, day],
  );
  return { day, steps: rows.flatMap(({ id, kind, done }) => {
    const topic = topics.get(id);
    return topic ? [{ topic, kind, done: done || topic.status === 'mastered' || (kind === 'new' && topic.status === 'passed_once') }] : [];
  }) };
}
