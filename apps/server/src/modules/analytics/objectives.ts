import { pool } from '../../db/pool.js';

export async function objectiveReport(days: number, zone: string) {
  const { rows } = await pool.query(`
    WITH observed AS (
      SELECT * FROM analytics_activity
      WHERE curriculum_objective_id IS NOT NULL
        AND occurred_at >= (date_trunc('day', now() AT TIME ZONE $2) - ($1::int - 1) * interval '1 day') AT TIME ZONE $2
        AND occurred_at <= now()
    ), metrics AS (
      SELECT curriculum_objective_id AS objective_id, content_id AS lesson_id,
        count(*) FILTER (WHERE name = 'topic_assigned')::int AS assignments,
        count(DISTINCT user_id) FILTER (WHERE name = 'topic_assigned')::int AS assigned_users,
        count(*) FILTER (WHERE name = 'topic_opened')::int AS opens,
        count(DISTINCT user_id) FILTER (WHERE name = 'topic_study_started')::int AS started_users,
        count(DISTINCT user_id) FILTER (WHERE name IN ('topic_opened','topic_study_started','topic_check_started','topic_check_completed'))::int AS engaged_users,
        count(*) FILTER (WHERE name = 'topic_check_completed')::int AS checks,
        count(*) FILTER (WHERE name = 'topic_check_completed' AND properties->>'passed' = 'false')::int AS failed,
        count(DISTINCT user_id) FILTER (WHERE name = 'topic_check_completed' AND properties->>'passed' = 'true')::int AS passed_users,
        count(DISTINCT user_id) FILTER (WHERE name = 'topic_check_completed' AND properties->>'passed' = 'true'
          AND properties->>'kind' = 'reconfirm')::int AS mastered_users,
        count(*) FILTER (WHERE name = 'topic_check_completed' AND properties->>'kind' = 'initial' AND source <> 'self')::int AS recommended_checks,
        count(*) FILTER (WHERE name = 'topic_check_completed' AND properties->>'kind' = 'initial' AND source = 'self')::int AS independent_checks,
        count(*) FILTER (WHERE name = 'topic_check_completed' AND properties->>'kind' = 'reconfirm')::int AS review_checks
      FROM observed GROUP BY GROUPING SETS ((curriculum_objective_id), (curriculum_objective_id, content_id))
    ), lesson_links AS (
      SELECT p.curriculum_id AS objective_id, p.key AS lesson_id FROM program_topics p WHERE p.curriculum_id IS NOT NULL
      UNION
      SELECT objective_id, lesson_id FROM metrics WHERE lesson_id IS NOT NULL
    ), lesson_details AS (
      SELECT link.objective_id,
        count(*) FILTER (WHERE p.curriculum_id = link.objective_id)::int AS linked_lessons,
        jsonb_agg(jsonb_build_object('id', link.lesson_id, 'title', coalesce(p.title, link.lesson_id),
          'current', p.curriculum_id IS NOT DISTINCT FROM link.objective_id, 'metrics', to_jsonb(m)) ORDER BY p.title, link.lesson_id) AS lessons
      FROM lesson_links link LEFT JOIN program_topics p ON p.key = link.lesson_id
      LEFT JOIN metrics m ON (m.objective_id, m.lesson_id) = (link.objective_id, link.lesson_id)
      GROUP BY link.objective_id
    )
    SELECT c.id, c.title, c.level, c.category, c.objective,
      coalesce(details.linked_lessons, 0) AS linked_lessons, coalesce(details.lessons, '[]') AS lessons,
      to_jsonb(m) AS metrics
    FROM curriculum_topics c LEFT JOIN lesson_details details ON details.objective_id = c.id
    LEFT JOIN metrics m ON m.objective_id = c.id AND m.lesson_id IS NULL
    ORDER BY coalesce(m.opens, 0) DESC, coalesce(m.assignments, 0) DESC, c.topic_number
  `, [days, zone]);
  return { objectives: rows };
}
