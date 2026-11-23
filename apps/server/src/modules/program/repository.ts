import type { PoolClient } from 'pg';
import type { CEFRLevel, PlacementGradeResult, TopicCategory, TopicSuggestion, TopicStudyContent, TopicRecommendation, CurriculumTopic } from '@app/shared';
import { pool } from '../../db/pool.js';
import { buildValuesClause } from '../../db/bulkInsert.js';
import { resolveTopics } from './topicCatalog.js';

export type UserTopicStatus = 'assigned' | 'passed_once' | 'mastered';
export type UserTopicSource = 'placement' | 'discovered';
export type TopicAttemptKind = 'initial' | 'reconfirm';

export interface UserTopicRow {
  id: string;
  user_id: string;
  catalog_key: string;
  catalog_title: string;
  catalog_category: TopicCategory;
  level: CEFRLevel | null;
  catalog_study: TopicStudyContent | null;
  curriculum: CurriculumTopic | null;
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
  variantId?: string;
  submissionId?: string;
  fromLevel: string | null;
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

export async function reservePlacementCheck(userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ token: string }>(
    `INSERT INTO placement_test_checks (user_id, expires_at)
     VALUES ($1, now() + interval '10 minutes')
     ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
     WHERE placement_test_checks.expires_at <= now()
     RETURNING token`,
    [userId],
  );
  return rows[0]?.token ?? null;
}

export async function releasePlacementCheck(userId: string, token: string): Promise<void> {
  await pool.query('DELETE FROM placement_test_checks WHERE user_id = $1 AND token = $2', [userId, token]);
}

export async function countPlacementTests(userId: string, monthStart: Date, resetsAt: Date): Promise<number> {
  const { rows } = await pool.query<{ used: number }>(
    `SELECT count(*)::int AS used FROM placement_tests WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
    [userId, monthStart, resetsAt],
  );
  return rows[0].used;
}

interface PlacementSummaryRow {
  id: string;
  variant_id: string | null;
  overall_level: CEFRLevel;
  to_level: CEFRLevel;
  purpose: string[] | null;
  created_at: Date;
  program_built_at: Date | null;
}

interface PlacementResultRow extends PlacementSummaryRow {
  mcq_answers: Record<string, string>;
  open9: string;
  open10: string;
  essay: string;
  skills: PlacementGradeResult['skills'];
  above_level: string;
  below_level: string;
  mcq_score: PlacementGradeResult['mcqScore'];
  open_grades: PlacementGradeResult['openGrades'];
  essay_grade: PlacementGradeResult['essayGrade'];
}

export async function listPlacementTests(userId: string): Promise<PlacementSummaryRow[]> {
  const { rows } = await pool.query<PlacementSummaryRow>(
    `SELECT id, variant_id, overall_level, to_level, purpose, created_at, program_built_at FROM placement_tests
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20`,
    [userId],
  );
  return rows;
}

export async function findPlacementResult(userId: string, id: string): Promise<PlacementResultRow | null> {
  const { rows } = await pool.query<PlacementResultRow>('SELECT * FROM placement_tests WHERE user_id = $1 AND id = $2', [userId, id]);
  return rows[0] ?? null;
}

async function withPlacementCheck<T>(userId: string, token: string, save: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      'SELECT token FROM placement_test_checks WHERE user_id = $1 AND token = $2 FOR UPDATE',
      [userId, token],
    );
    if (!lock.rowCount) throw new Error('Placement check reservation was replaced');
    const result = await save(client);
    await client.query('DELETE FROM placement_test_checks WHERE user_id = $1 AND token = $2', [userId, token]);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function savePlacementTest(input: NewPlacementTest, topics: TopicRecommendation[], levels: readonly CEFRLevel[], token: string): Promise<TopicSuggestion[]> {
  return withPlacementCheck(input.userId, token, async (client) => {
    const inserted = await insertNewUserTopics(input.userId, topics, levels, 'placement', client);
    await createPlacementTest(input, client);
    return inserted;
  });
}

// Only untouched recommendations from the shared curriculum can be replaced.
const REPLACEABLE_PLACEMENT_TOPIC = `p.curriculum_slot AND u.source = 'placement' AND u.status = 'assigned'
  AND u.study_content IS NULL AND NOT EXISTS (SELECT 1 FROM topic_attempts a WHERE a.user_topic_id = u.id)`;

export async function saveProgramBuild(
  userId: string, placementId: string, topics: TopicRecommendation[], levels: readonly CEFRLevel[], token: string,
  replaceUnstarted = false,
) {
  return withPlacementCheck(userId, token, async (client) => {
    const marked = await client.query(
      `UPDATE placement_tests SET program_built_at = now()
       WHERE user_id = $1 AND id = $2 AND (program_built_at IS NULL OR $3::boolean)
         AND id = (SELECT id FROM placement_tests WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1)`,
      [userId, placementId, replaceUnstarted],
    );
    if (!marked.rowCount) return;
    if (replaceUnstarted) {
      const catalogIds = topics.map(({ key }) => key);
      const unselected = `u.user_id = $1 AND u.withdrawn_at IS NULL AND p.key = u.catalog_key
        AND p.curriculum_id <> ALL($2::text[]) AND ${REPLACEABLE_PLACEMENT_TOPIC}`;
      // Serialize with the start of an attempt, then recheck under a fresh snapshot.
      await client.query(`SELECT u.id FROM user_topics u, program_topics p WHERE ${unselected} FOR UPDATE OF u`, [userId, catalogIds]);
      await client.query(
        `UPDATE user_topics u SET withdrawn_at = now() FROM program_topics p WHERE ${unselected}`, [userId, catalogIds],
      );
    }
    await insertNewUserTopics(userId, topics, levels, 'placement', client);
  });
}

async function createPlacementTest(input: NewPlacementTest, client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO placement_tests
       (user_id, from_level, to_level, purpose, mcq_answers, open9, open10, essay,
        overall_level, skills, above_level, below_level, mcq_score, open_grades, essay_grade, variant_id, id, program_built_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17::uuid, gen_random_uuid()), now())`,
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
      input.variantId ?? null,
      input.submissionId ?? null,
    ],
  );
}

async function insertNewUserTopics(
  userId: string,
  candidates: TopicRecommendation[],
  levels: readonly CEFRLevel[],
  source: UserTopicSource,
  db: PoolClient,
): Promise<TopicSuggestion[]> {
  if (candidates.length === 0 || levels.length === 0) return [];
  const topics = await resolveTopics(db, userId, candidates, levels);
  const rows = buildValuesClause(topics.map((topic) => [userId, topic.key, topic.key, topic.title, topic.category, topic.rationale, source]));
  if (!rows) return [];
  const { rows: inserted } = await db.query<{ catalog_key: string }>(
    `INSERT INTO user_topics (user_id, catalog_key, key, title, category, rationale, source)
     VALUES ${rows.placeholders}
     ON CONFLICT (user_id, catalog_key) DO UPDATE SET withdrawn_at = NULL, rationale = EXCLUDED.rationale,
       source = EXCLUDED.source, updated_at = now()
     WHERE user_topics.withdrawn_at IS NOT NULL
     RETURNING catalog_key`,
    rows.values,
  );
  const insertedKeys = new Set(inserted.map(({ catalog_key }) => catalog_key));
  return topics.filter(({ key }) => insertedKeys.has(key));
}

const USER_TOPIC_SELECT = `SELECT t.*, c.title AS catalog_title, c.category AS catalog_category, c.level,
  c.study_content AS catalog_study, to_jsonb(curriculum) AS curriculum
  FROM user_topics t JOIN program_topics c ON c.key = t.catalog_key
  LEFT JOIN curriculum_topics curriculum ON curriculum.id = c.curriculum_id`;

export async function listAssignedTopicKeys(userId: string, replaceUnstarted = false): Promise<string[]> {
  const { rows } = await pool.query<{ curriculum_id: string }>(
    `SELECT DISTINCT p.curriculum_id FROM user_topics u JOIN program_topics p ON p.key = u.catalog_key
     WHERE u.user_id = $1 AND p.curriculum_id IS NOT NULL AND u.withdrawn_at IS NULL
       AND (NOT $2::boolean OR NOT (${REPLACEABLE_PLACEMENT_TOPIC}))`,
    [userId, replaceUnstarted],
  );
  return rows.map(({ curriculum_id }) => curriculum_id);
}

export async function findUserTopics(userId: string): Promise<UserTopicRow[]> {
  const { rows } = await pool.query<UserTopicRow>(`${USER_TOPIC_SELECT} WHERE t.user_id = $1 AND t.withdrawn_at IS NULL ORDER BY t.created_at, t.id`, [userId]);
  return rows;
}

export async function findUserTopic(userId: string, id: string): Promise<UserTopicRow | null> {
  const { rows } = await pool.query<UserTopicRow>(
    `${USER_TOPIC_SELECT} WHERE t.user_id = $1 AND t.withdrawn_at IS NULL
     AND t.id = COALESCE((SELECT topic_id FROM user_topic_redirects WHERE old_id = $2), $2)`,
    [userId, id],
  );
  return rows[0] ?? null;
}

export interface TopicStatusPatch {
  status: UserTopicStatus;
  passedOnceAt?: Date | null;
  nextReviewAt?: Date | null;
  masteredAt?: Date | null;
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

export async function createAttempt(userTopicId: string, kind: TopicAttemptKind, items: unknown): Promise<TopicAttemptRow | null> {
  const { rows } = await pool.query<TopicAttemptRow>(
    `INSERT INTO topic_attempts (user_topic_id, kind, items)
     SELECT id, $2, $3 FROM user_topics WHERE id = $1 AND withdrawn_at IS NULL FOR UPDATE
     RETURNING *`,
    [userTopicId, kind, JSON.stringify(items)],
  );
  return rows[0] ?? null;
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
  discoveredTopics: TopicRecommendation[];
}

export async function saveTopicGrade(
  userId: string,
  attempt: TopicAttemptRow,
  patch: AttemptResultPatch,
  progress: TopicStatusPatch,
  levels: readonly CEFRLevel[],
): Promise<TopicSuggestion[] | null> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const pending = await db.query(
      'SELECT id FROM topic_attempts WHERE id = $1 AND graded_at IS NULL FOR UPDATE',
      [attempt.id],
    );
    if (!pending.rowCount) {
      await db.query('ROLLBACK');
      return null;
    }
    await db.query(
      `UPDATE user_topics
       SET status = $2, passed_once_at = $3, next_review_at = $4, mastered_at = $5, updated_at = now()
       WHERE id = $1 AND status = $6`,
      [attempt.user_topic_id, progress.status, progress.passedOnceAt ?? null, progress.nextReviewAt ?? null, progress.masteredAt ?? null,
        attempt.kind === 'initial' ? 'assigned' : 'passed_once'],
    );
    const inserted = await insertNewUserTopics(userId, patch.discoveredTopics, levels, 'discovered', db);
    await db.query(
      `UPDATE topic_attempts
       SET answers = $2, score_out_of_10 = $3, passed = $4, notes = $5, discovered_topics = $6, graded_at = now()
       WHERE id = $1`,
      [attempt.id, JSON.stringify(patch.answers), patch.scoreOutOf10, patch.passed, JSON.stringify(patch.notes), JSON.stringify(inserted)],
    );
    await db.query('COMMIT');
    return inserted;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
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
    `SELECT t.id, u.email AS user_email, c.title, c.category, t.status, t.source, t.next_review_at, t.updated_at
     FROM user_topics t
     JOIN program_topics c ON c.key = t.catalog_key
     LEFT JOIN users u ON u.id = t.user_id
     WHERE t.withdrawn_at IS NULL
     ORDER BY t.updated_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
