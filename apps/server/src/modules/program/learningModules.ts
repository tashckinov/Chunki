import { CEFR_LEVELS } from '@app/shared';
import { pool } from '../../db/pool.js';

export async function listLearningModules(userId: string) {
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.description, m.level, m.type,
       jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title) ORDER BY links.position) AS topics
     FROM curriculum_modules m
     JOIN curriculum_module_topics links ON links.module_id = m.id
     JOIN curriculum_topics c ON c.id = links.topic_id
     WHERE EXISTS (
       SELECT 1 FROM curriculum_module_topics included
       JOIN program_topics p ON p.curriculum_id = included.topic_id
       JOIN user_topics u ON u.catalog_key = p.key
       WHERE included.module_id = m.id AND u.user_id = $1 AND u.withdrawn_at IS NULL
     )
     GROUP BY m.id
     ORDER BY array_position($2::text[], m.level), m.position, m.id`,
    [userId, CEFR_LEVELS],
  );
  return rows;
}
