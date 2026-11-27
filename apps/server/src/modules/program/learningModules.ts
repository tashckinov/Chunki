import { assignedModule } from './topicAccess.js';
import { CEFR_LEVELS } from '@app/shared';
import { pool } from '../../db/pool.js';

export async function listLearningModules(userId: string) {
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.description, m.level, m.type,
       jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title) ORDER BY links.position) AS topics
     FROM curriculum_modules m
     JOIN curriculum_module_topics links ON links.module_id = m.id
     JOIN curriculum_topics c ON c.id = links.topic_id
     WHERE ${assignedModule('$1', 'm.id')}
     GROUP BY m.id
     ORDER BY array_position($2::text[], m.level), m.position, m.id`,
    [userId, CEFR_LEVELS],
  );
  return rows;
}
