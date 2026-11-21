import type { DailyCardGoal, StudyGoalStatus } from '@app/shared';
import { pool } from '../../db/pool.js';

export async function getStudyGoal(userId: string): Promise<StudyGoalStatus> {
  const { rows } = await pool.query<StudyGoalStatus>(
    `SELECT study_intro_completed_at IS NOT NULL AS "introCompleted", daily_card_goal AS "dailyCardGoal"
     FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0];
}

export async function completeStudyIntro(userId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET study_intro_completed_at = now() WHERE id = $1 AND study_intro_completed_at IS NULL',
    [userId],
  );
}

export async function saveStudyGoal(userId: string, goal: DailyCardGoal): Promise<StudyGoalStatus> {
  const { rows } = await pool.query<StudyGoalStatus>(
    `UPDATE users
     SET daily_card_goal = $2
     WHERE id = $1 AND study_intro_completed_at IS NOT NULL
     RETURNING true AS "introCompleted", daily_card_goal AS "dailyCardGoal"`,
    [userId, goal],
  );
  return rows[0] ?? { introCompleted: false, dailyCardGoal: null };
}
