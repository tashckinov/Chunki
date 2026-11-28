import { pool } from '../../db/pool.js';

const period = `((date_trunc('day', now() AT TIME ZONE $2) - ($1::int - 1) * interval '1 day') AT TIME ZONE $2)`;
const learning = `('topic_check_completed','deck_completed','card_reviewed','card_first_mastered','comic_completed')`;
const active = `(name IN ('app_opened','placement_started','placement_completed','program_opened','topic_opened',
  'topic_study_started','starred_topic_study_started','collection_opened','comic_opened','deck_started') OR name IN ${learning})`;
const activation = `(name IN ('deck_completed','card_first_mastered','comic_completed')
  OR (name = 'topic_check_completed' AND properties->>'passed' = 'true'))`;
const contentTitles = `LEFT JOIN program_topics t ON e.content_type = 'topic' AND t.key = e.content_id
 LEFT JOIN collections c ON e.content_type = 'collection' AND c.slug = e.content_id
 LEFT JOIN chunks k ON e.content_type IN ('card','comic') AND k.id::text = e.content_id`;

export async function analyticsReport(days: number, zone: string) {
  const params = [days, zone];
  const [totals, events, content, cohort, delivery, completion, adherence] = await Promise.all([
    pool.query(`SELECT (SELECT count(*)::int FROM analytics_users) AS registered,
      (SELECT count(*)::int FROM analytics_users WHERE created_at BETWEEN ${period} AND now()) AS new_users,
      count(DISTINCT user_id) FILTER (WHERE occurred_at BETWEEN ${period} AND now() AND name IN ${learning})::int AS learners,
      count(*) FILTER (WHERE occurred_at BETWEEN ${period} AND now() AND name IN ${learning})::int AS learning_actions,
      count(DISTINCT user_id) FILTER (WHERE occurred_at BETWEEN ${period} AND now()
        AND name = 'starred_topic_study_started')::int AS starred_study_users,
      count(DISTINCT user_id) FILTER (WHERE occurred_at BETWEEN ${period} AND now() AND name = 'topic_check_completed'
        AND source = 'self' AND properties->>'kind' = 'initial')::int AS starred_check_users,
      count(*) FILTER (WHERE occurred_at BETWEEN ${period} AND now() AND name = 'topic_check_completed'
        AND properties->>'passed' = 'true' AND properties->>'kind' = 'initial' AND source IN ('placement','discovered'))::int AS recommended_passes,
      count(DISTINCT user_id) FILTER (WHERE (occurred_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)::int AS active_1,
      count(DISTINCT user_id) FILTER (WHERE (occurred_at AT TIME ZONE $2)::date >= (now() AT TIME ZONE $2)::date - 6)::int AS active_7,
      count(DISTINCT user_id) FILTER (WHERE (occurred_at AT TIME ZONE $2)::date >= (now() AT TIME ZONE $2)::date - 29)::int AS active_30
      FROM analytics_activity WHERE occurred_at <= now() AND ${active}`, params),
    pool.query(`SELECT name, coalesce(properties->>'context',
        CASE WHEN name LIKE 'topic_check_%' THEN
          CASE WHEN properties->>'kind' = 'reconfirm' THEN 'reconfirm'
            WHEN source = 'self' THEN 'independent' ELSE 'recommended' END END, source) AS segment,
      count(*)::int AS events, count(DISTINCT user_id)::int AS users
      FROM analytics_activity WHERE occurred_at BETWEEN ${period} AND now()
      GROUP BY name, segment ORDER BY name, segment`, params),
    pool.query(`WITH grouped AS (
      SELECT e.content_type, e.content_id, e.user_id,
        count(*) FILTER (WHERE name IN ('topic_opened','collection_opened','card_viewed','comic_opened')) AS opens,
        count(*) FILTER (WHERE name IN ('topic_study_started','topic_check_started','deck_started','card_reviewed','comic_completed')) AS actions,
        count(*) FILTER (WHERE name IN ${learning}) AS finishes,
        count(DISTINCT (occurred_at AT TIME ZONE $2)::date) AS active_days
      FROM analytics_activity e
      WHERE occurred_at BETWEEN ${period} AND now() AND content_type IN ('topic','collection','card','comic') AND content_id IS NOT NULL AND name <> 'topic_assigned'
      GROUP BY e.content_type, e.content_id, e.user_id
    ), ranked AS (
      SELECT e.content_type, e.content_id, coalesce(t.title, c.title, k.text, e.content_id) AS title, count(*)::int AS users,
        sum(opens)::int AS opens, sum(actions)::int AS actions, sum(finishes)::int AS finishes,
        count(*) FILTER (WHERE active_days > 1)::int AS returning,
        row_number() OVER (PARTITION BY e.content_type ORDER BY sum(finishes) DESC, sum(actions) DESC, sum(opens) DESC, e.content_id) AS rank
      FROM grouped e ${contentTitles} GROUP BY e.content_type, e.content_id, t.title, c.title, k.text
    ) SELECT * FROM ranked WHERE rank <= 10 ORDER BY content_type, rank`, params),
    pool.query(`WITH cohort AS (
      SELECT id, created_at, (created_at AT TIME ZONE $2)::date AS joined FROM analytics_users WHERE created_at BETWEEN ${period} AND now()
    ), milestones AS (
      SELECT c.id, c.joined,
        min(occurred_at) FILTER (WHERE name IN ('placement_started','placement_completed')) AS test_started,
        min(occurred_at) FILTER (WHERE name = 'placement_started') AS observed_start,
        min(occurred_at) FILTER (WHERE name = 'placement_completed') AS tested
      FROM cohort c LEFT JOIN product_activity e ON e.user_id = c.id AND e.occurred_at BETWEEN c.created_at AND now() GROUP BY c.id,c.joined
    ), user_metrics AS (
      SELECT m.*,
        exists (SELECT 1 FROM analytics_activity e WHERE e.user_id=m.id AND e.occurred_at <= now() AND ${activation}) AS activated,
        exists (SELECT 1 FROM analytics_activity e WHERE e.user_id=m.id AND e.occurred_at BETWEEN m.tested AND now()
          AND name = 'topic_check_completed' AND properties->>'passed' = 'true' AND source IN ('placement','discovered')
          AND properties->>'kind' = 'initial') AS first_lesson
      FROM milestones m
    )
    SELECT count(*)::int AS total, count(test_started)::int AS started, count(observed_start)::int AS observed_starts, count(tested)::int AS tested,
      count(*) FILTER (WHERE activated)::int AS activated, count(*) FILTER (WHERE first_lesson)::int AS first_lesson,
      (SELECT jsonb_agg(v ORDER BY day) FROM (
          SELECT day, count(*) FILTER (WHERE joined + day < (now() AT TIME ZONE $2)::date)::int AS eligible,
            count(*) FILTER (WHERE joined + day < (now() AT TIME ZONE $2)::date AND EXISTS (
              SELECT 1 FROM analytics_activity e WHERE e.user_id=m.id AND (e.occurred_at AT TIME ZONE $2)::date=joined+day
                AND ${active}
            ))::int AS returned
          FROM (VALUES (1),(7),(30)) d(day) LEFT JOIN user_metrics m ON true GROUP BY day
        ) v) AS retention
    FROM user_metrics`, params),
    pool.query(`SELECT
      (SELECT count(DISTINCT user_id)::int FROM study_reminders r JOIN analytics_users u ON u.id = r.user_id) AS subscribers,
      count(*)::int AS scheduled, count(attempted_at)::int AS attempted, count(accepted_at)::int AS sent,
      count(failed_at)::int AS failed, count(clicked_at) FILTER (WHERE accepted_at IS NOT NULL)::int AS clicks,
      count(DISTINCT user_id) FILTER (WHERE clicked_at IS NOT NULL AND accepted_at IS NOT NULL)::int AS clicked_users
      FROM notification_deliveries d JOIN analytics_users u ON u.id = d.user_id WHERE scheduled_at BETWEEN ${period} AND now()`, params),
    pool.query(`SELECT name, count(*)::int AS started, count(*) FILTER (WHERE finished)::int AS finished
      FROM (
        SELECT e.name, EXISTS (
          SELECT 1 FROM analytics_activity f WHERE f.user_id=e.user_id AND f.journey_id=e.journey_id
            AND f.name = CASE e.name WHEN 'deck_started' THEN 'deck_completed' WHEN 'comic_opened' THEN 'comic_completed'
              ELSE 'topic_check_completed' END AND f.occurred_at BETWEEN e.occurred_at AND now()
        ) AS finished
        FROM analytics_activity e
        WHERE e.occurred_at BETWEEN ${period} AND now() AND e.name IN ('deck_started','comic_opened','topic_check_started')
      ) observed GROUP BY name`, params),
    pool.query(`WITH plans AS (
      SELECT p.*, ((p.day + 1)::timestamp AT TIME ZONE p.time_zone) AS deadline
      FROM daily_learning_plans p JOIN analytics_users u ON u.id = p.user_id WHERE p.created_at BETWEEN ${period} AND now() AND p.time_zone IS NOT NULL
        AND (cardinality(p.review_ids) > 0 OR p.new_topic_id IS NOT NULL)
    ), finished AS (
      SELECT p.user_id, p.day,
        bool_and(EXISTS (SELECT 1 FROM topic_attempts a
          WHERE a.user_topic_id = step.id AND a.kind = step.kind
            AND a.graded_at >= p.created_at AND a.graded_at < p.deadline)) AS complete
      FROM plans p CROSS JOIN LATERAL (
        SELECT unnest(p.review_ids) AS id, 'reconfirm' AS kind
        UNION ALL SELECT p.new_topic_id, 'initial' WHERE p.new_topic_id IS NOT NULL
      ) step WHERE p.deadline <= now() GROUP BY p.user_id, p.day
    )
    SELECT count(*)::int AS plans, count(*) FILTER (WHERE complete)::int AS finished FROM finished`, params),
  ]);
  return { totals: totals.rows[0], events: events.rows, content: content.rows, cohort: cohort.rows[0],
    delivery: delivery.rows[0], completion: completion.rows, adherence: adherence.rows[0] };
}

export async function activityTimeline(input: { days: number; zone: string; user?: string; name?: string; content?: string; offset: number }) {
  const { rows } = await pool.query(`SELECT e.event_id, e.user_id, u.email, e.name, e.occurred_at, e.content_type, e.content_id,
    e.journey_id, e.source, e.properties, e.curriculum_objective_id, e.assignment_id, coalesce(t.title, c.title, k.text) AS title
    FROM product_activity e JOIN users u ON u.id=e.user_id ${contentTitles}
    WHERE e.occurred_at BETWEEN ${period} AND now()
      AND ($3::text IS NULL OR lower(u.email) = lower($3) OR u.id::text = $3)
      AND ($4::text IS NULL OR e.name = $4) AND ($5::text IS NULL OR e.content_id = $5)
    ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 51 OFFSET $6`,
    [input.days, input.zone, input.user || null, input.name || null, input.content || null, input.offset]);
  return { rows: rows.slice(0, 50), more: rows.length > 50 };
}
