import { pool } from '../../db/pool.js';
import { findUserTopic } from './repository.js';

type Rating = 'clear' | 'unclear';

export async function rateTopicStudy(userId: string, id: string, rating?: Rating): Promise<Rating | null | undefined> {
  const topic = await findUserTopic(userId, id);
  if (!topic || (!topic.study_content && !topic.catalog_study)) return undefined;

  if (rating) {
    await pool.query(
      `INSERT INTO topic_study_ratings (topic_key, user_id, rating) VALUES ($1, $2, $3)
       ON CONFLICT (topic_key, user_id) DO UPDATE SET rating = EXCLUDED.rating`,
      [topic.catalog_key, userId, rating],
    );
    return rating;
  }

  const { rows: [row] } = await pool.query<{ rating: Rating }>(
    'SELECT rating FROM topic_study_ratings WHERE topic_key = $1 AND user_id = $2',
    [topic.catalog_key, userId],
  );
  return row?.rating ?? null;
}
