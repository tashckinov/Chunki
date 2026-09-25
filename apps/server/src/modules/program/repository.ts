import type { TopicCategory, TopicSuggestion } from '@app/shared';
import { pool } from '../../db/pool.js';

export type UserTopicStatus = 'assigned' | 'passed_once' | 'mastered';
export type UserTopicSource = 'placement' | 'discovered';
export type TopicAttemptKind = 'initial' | 'reconfirm';

export interface UserTopicRow {
  id: string;
  user_id: string;
  key: string;
  title: string;
  category: TopicCategory;
  rationale: string;
  source: UserTopicSource;
  status: UserTopicStatus;
  study_content: unknown | null;
  passed_once_at: Date | null;
  next_review_at: Date | null;
  mastered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface NewPlacementTest {
  userId: string;
  fromLevel: string;
  toLevel: string;
  purpose: string[];
  mcqAnswers: Record<string, string>;
  open9: string;
  open10: string;
  essay: string;
  overallLevel: string;
  skills: unknown;
  aboveLevel: string;
  belowLevel: string;
  mcqScore: unknown;
  openGrades: unknown;
  essayGrade: unknown;
}

export async function createPlacementTest(input: NewPlacementTest): Promise<void> {
  await pool.query(
    `INSERT INTO placement_tests
       (user_id, from_level, to_level, purpose, mcq_answers, open9, open10, essay,
        overall_level, skills, above_level, below_level, mcq_score, open_grades, essay_grade)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      input.userId,
      input.fromLevel,
      input.toLevel,
      input.purpose,
      JSON.stringify(input.mcqAnswers),
      input.open9,
      input.open10,
      input.essay,
      input.overallLevel,
      JSON.stringify(input.skills),
      input.aboveLevel,
      input.belowLevel,
      JSON.stringify(input.mcqScore),
      JSON.stringify(input.openGrades),
      JSON.stringify(input.essayGrade),
    ],
  );
}

/** Inserts topics for a user, skipping any whose `key` they already have
 * (ON CONFLICT DO NOTHING) — this is how a re-discovered weak spot dedupes
 * against an existing (possibly already-mastered) topic. Returns only the
 * rows that were actually newly inserted. */
export async function insertNewUserTopics(userId: string, topics: TopicSuggestion[], source: UserTopicSource): Promise<UserTopicRow[]> {
  const inserted: UserTopicRow[] = [];
  for (const topic of topics) {
    const { rows } = await pool.query<UserTopicRow>(
      `INSERT INTO user_topics (user_id, key, title, category, rationale, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, key) DO NOTHING
       RETURNING *`,
      [userId, topic.key, topic.title, topic.category, topic.rationale, source],
    );
    if (rows[0]) inserted.push(rows[0]);
  }
  return inserted;
}

export async function findUserTopics(userId: string): Promise<UserTopicRow[]> {
  const { rows } = await pool.query<UserTopicRow>(`SELECT * FROM user_topics WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
  return rows;
}

export async function findUserTopic(userId: string, id: string): Promise<UserTopicRow | null> {
  const { rows } = await pool.query<UserTopicRow>(`SELECT * FROM user_topics WHERE user_id = $1 AND id = $2`, [userId, id]);
  return rows[0] ?? null;
}

export async function updateTopicStudyContent(id: string, studyContent: unknown): Promise<void> {
  await pool.query(`UPDATE user_topics SET study_content = $2, updated_at = now() WHERE id = $1`, [id, JSON.stringify(studyContent)]);
}

export interface TopicStatusPatch {
  status: UserTopicStatus;
  passedOnceAt?: Date | null;
  nextReviewAt?: Date | null;
  masteredAt?: Date | null;
}

export async function updateTopicStatus(id: string, patch: TopicStatusPatch): Promise<UserTopicRow> {
  const { rows } = await pool.query<UserTopicRow>(
    `UPDATE user_topics
     SET status = $2, passed_once_at = $3, next_review_at = $4, mastered_at = $5, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, patch.status, patch.passedOnceAt ?? null, patch.nextReviewAt ?? null, patch.masteredAt ?? null],
  );
  return rows[0];
}

export interface TopicAttemptRow {
  id: string;
  user_topic_id: string;
  kind: TopicAttemptKind;
  items: unknown;
  answers: unknown | null;
  score_out_of_10: number | null;
  passed: boolean | null;
  notes: unknown | null;
  discovered_topics: unknown | null;
  created_at: Date;
  graded_at: Date | null;
}

export async function createAttempt(userTopicId: string, kind: TopicAttemptKind, items: unknown): Promise<TopicAttemptRow> {
  const { rows } = await pool.query<TopicAttemptRow>(
    `INSERT INTO topic_attempts (user_topic_id, kind, items) VALUES ($1, $2, $3) RETURNING *`,
    [userTopicId, kind, JSON.stringify(items)],
  );
  return rows[0];
}

export async function findAttempt(id: string): Promise<TopicAttemptRow | null> {
  const { rows } = await pool.query<TopicAttemptRow>(`SELECT * FROM topic_attempts WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export interface AttemptResultPatch {
  answers: unknown;
  scoreOutOf10: number;
  passed: boolean;
  notes: unknown;
  discoveredTopics: unknown;
}

export async function updateAttemptResult(id: string, patch: AttemptResultPatch): Promise<void> {
  await pool.query(
    `UPDATE topic_attempts
     SET answers = $2, score_out_of_10 = $3, passed = $4, notes = $5, discovered_topics = $6, graded_at = now()
     WHERE id = $1`,
    [id, JSON.stringify(patch.answers), patch.scoreOutOf10, patch.passed, JSON.stringify(patch.notes), JSON.stringify(patch.discoveredTopics)],
  );
}

export interface AdminTopicActivityRow {
  id: string;
  user_email: string | null;
  title: string;
  category: string;
  status: UserTopicStatus;
  source: UserTopicSource;
  next_review_at: Date | null;
  updated_at: Date;
}

export async function listRecentActivityForAdmin(limit: number): Promise<AdminTopicActivityRow[]> {
  const { rows } = await pool.query<AdminTopicActivityRow>(
    `SELECT t.id, u.email AS user_email, t.title, t.category, t.status, t.source, t.next_review_at, t.updated_at
     FROM user_topics t
     LEFT JOIN users u ON u.id = t.user_id
     ORDER BY t.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
