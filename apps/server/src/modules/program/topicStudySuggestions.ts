import { pool } from '../../db/pool.js';
import { findUserTopic } from './repository.js';

export async function topicStudySuggestion(userId: string, id: string, message?: string): Promise<string | null | undefined> {
  const topic = await findUserTopic(userId, id);
  if (!topic || (!topic.study_content && !topic.catalog_study)) return undefined;

  if (message !== undefined) {
    await pool.query(
      `INSERT INTO topic_study_suggestions (topic_key, user_id, message) VALUES ($1, $2, $3)
       ON CONFLICT (topic_key, user_id) DO UPDATE SET message = EXCLUDED.message, updated_at = now()`,
      [topic.catalog_key, userId, message],
    );
    return message;
  }

  const { rows: [row] } = await pool.query<{ message: string }>(
    'SELECT message FROM topic_study_suggestions WHERE topic_key = $1 AND user_id = $2', [topic.catalog_key, userId],
  );
  return row?.message ?? null;
}

export async function listTopicStudySuggestions(key: string | null, offset: number) {
  const pageSize = 20;
  const { rows } = await pool.query<{ userId: string; topicKey: string; title: string; topicNumber: number | null; message: string; updatedAt: Date }>(
    `SELECT s.user_id AS "userId", s.topic_key AS "topicKey", p.title, c.topic_number AS "topicNumber",
       s.message, s.updated_at AS "updatedAt"
     FROM topic_study_suggestions s JOIN program_topics p ON p.key = s.topic_key
     LEFT JOIN curriculum_topics c ON c.id = p.curriculum_id
     WHERE ($1::text IS NULL OR s.topic_key = $1)
     ORDER BY s.updated_at DESC, s.topic_key, s.user_id LIMIT $2 OFFSET $3`,
    [key, pageSize + 1, offset],
  );
  return { suggestions: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}
