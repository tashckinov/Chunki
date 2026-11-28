import { pool } from '../../db/pool.js';

export async function resetLearningProgress(userId: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`
      UPDATE user_topics
      SET status = 'assigned', passed_once_at = NULL, next_review_at = NULL, mastered_at = NULL,
        withdrawn_at = CASE WHEN source = 'placement' THEN NULL ELSE now() END,
        progress_reset_at = clock_timestamp(), updated_at = now(),
        attempt_generation_token = NULL, attempt_generation_expires_at = NULL
      WHERE user_id = $1 AND withdrawn_at IS NULL
    `, [userId]);
    await db.query(`
      DELETE FROM daily_learning_plans
      WHERE user_id = $1 AND day >= (now() AT TIME ZONE coalesce(time_zone, 'UTC'))::date
    `, [userId]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
