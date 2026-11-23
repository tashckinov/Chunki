import type { PoolClient } from 'pg';
import { CEFR_LEVELS, type CEFRLevel, type CurriculumTopic, type TopicCategory, type TopicIdentity, type TopicRecommendation, type TopicStudyContent, type TopicSuggestion } from '@app/shared';
import { pool } from '../../db/pool.js';

export function topicLevels(current: CEFRLevel, target: CEFRLevel): readonly CEFRLevel[] {
  const end = CEFR_LEVELS.indexOf(target);
  // The app's '+' assessments are upper bands of the same CEFR level.
  const start = CEFR_LEVELS.indexOf(current) - (current.endsWith('+') ? 1 : 0);
  return CEFR_LEVELS.slice(Math.min(start, end), end + 1);
}

export async function listCurriculumTopics(target?: CEFRLevel): Promise<CurriculumTopic[]> {
  const { rows } = await pool.query<CurriculumTopic>(
    `SELECT id, title, level, category, objective, subtopics, source, topic_number FROM curriculum_topics
     WHERE $1::text[] IS NULL OR level = ANY($1) ORDER BY level, category, title, id`,
    [target ? topicLevels('A1', target) : null],
  );
  return rows;
}

const PROGRAM_CATEGORY: Record<CurriculumTopic['category'], TopicCategory> = {
  Grammar: 'Грамматика', Vocabulary: 'Лексика', Functions: 'Использование языка',
  Discourse: 'Использование языка', Reading: 'Понимание', Writing: 'Письмо',
  Listening: 'Понимание', Speaking: 'Использование языка',
};

export async function resolveTopics(
  db: PoolClient, userId: string, candidates: TopicRecommendation[], levels: readonly CEFRLevel[],
): Promise<TopicSuggestion[]> {
  if (!candidates.length || !levels.length) return [];
  // Includes linked legacy assignments. Their progress satisfies this same
  // catalog topic without moving any existing assignment or stored lesson.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('program-topic-catalog'))");
  const { rows } = await db.query<CurriculumTopic>(
    `SELECT c.* FROM curriculum_topics c WHERE c.id = ANY($1::text[]) AND c.level = ANY($2::text[])
       AND NOT EXISTS (
         SELECT 1 FROM user_topics u JOIN program_topics p ON p.key = u.catalog_key
         WHERE u.user_id = $3 AND p.curriculum_id = c.id
       )`,
    [candidates.map(({ key }) => key), levels, userId],
  );
  const available = new Map(rows.map((topic) => [topic.id, topic]));
  const resolved: TopicSuggestion[] = [];
  for (const { key, rationale } of candidates) {
    const topic = available.get(key);
    if (!topic) continue;
    available.delete(key);
    const category = PROGRAM_CATEGORY[topic.category];
    // The slot uses independent study storage. Existing authored lessons stay
    // on their original records and never become input to catalog generation.
    const { rows: [slot] } = await db.query<{ key: string }>(
      `INSERT INTO program_topics (key, title, category, level, curriculum_id, curriculum_slot)
       VALUES ('curriculum-' || gen_random_uuid(), $1, $2, $3, $4, true)
       ON CONFLICT (curriculum_id) WHERE curriculum_slot
       DO UPDATE SET curriculum_id = EXCLUDED.curriculum_id
       RETURNING key`,
      [topic.title, category, topic.level, topic.id],
    );
    resolved.push({ key: slot.key, title: topic.title, category, level: topic.level, rationale });
  }
  return resolved;
}

export async function createCurriculumTopic(topic: CurriculumTopic): Promise<CurriculumTopic | null> {
  const { rows } = await pool.query<CurriculumTopic>(
    `INSERT INTO curriculum_topics (id, title, level, category, objective, subtopics)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING id, title, level, category, objective, subtopics, source, topic_number`,
    [topic.id, topic.title, topic.level, topic.category, topic.objective, topic.subtopics],
  );
  return rows[0] ?? null;
}

export async function linkCurriculumTopic(key: string, curriculumId: string | null): Promise<boolean> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('program-topic-catalog'))");
    const { rowCount } = await db.query(
      `UPDATE program_topics p SET curriculum_id = $2 WHERE p.key = $1 AND NOT p.curriculum_slot
       AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM curriculum_topics WHERE id = $2))`,
      [key, curriculumId],
    );
    await db.query('COMMIT');
    return rowCount === 1;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function saveCatalogStudy(topic: TopicIdentity, study: TopicStudyContent, curriculumId: string | null): Promise<TopicStudyContent> {
  const { rows } = await pool.query<{ study_content: TopicStudyContent }>(
    `UPDATE program_topics SET study_content = COALESCE(study_content, $3::jsonb)
     WHERE key = $1 AND level IS NOT DISTINCT FROM $2 AND curriculum_id IS NOT DISTINCT FROM $4 RETURNING study_content`,
    [topic.key, topic.level, JSON.stringify(study), curriculumId],
  );
  return rows[0]?.study_content ?? study;
}

export interface AdminTopicDetail extends TopicIdentity {
  aliases: string[];
  study: TopicStudyContent | null;
  curriculumId: string | null;
  curriculumSlot: boolean;
}

export async function listTopicsForReview(search: string, offset: number) {
  const pageSize = 50;
  const { rows } = await pool.query<TopicIdentity & { topicNumber: number | null }>(
    `SELECT p.key, p.title, p.category, p.level, c.topic_number AS "topicNumber"
     FROM program_topics p LEFT JOIN curriculum_topics c ON c.id = p.curriculum_id
     WHERE $1 = '' OR strpos(title_key, program_topic_name($1)) > 0
       OR strpos(p.key, program_topic_name($1)) > 0
       OR EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE strpos(a, program_topic_name($1)) > 0)
     ORDER BY title_key, p.key LIMIT $2 OFFSET $3`,
    [search, pageSize + 1, offset],
  );
  return { topics: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}

export async function getTopicForReview(key: string): Promise<AdminTopicDetail | null> {
  const { rows } = await pool.query<AdminTopicDetail>(
    'SELECT key, title, category, level, aliases, study_content AS study, curriculum_id AS "curriculumId", curriculum_slot AS "curriculumSlot" FROM program_topics WHERE key = $1', [key],
  );
  return rows[0] ?? null;
}

export async function updateTopicForReview(topic: TopicIdentity) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('program-topic-catalog'))");
    const current = await db.query<{ curriculum_slot: boolean }>('SELECT curriculum_slot FROM program_topics WHERE key = $1', [topic.key]);
    if (!current.rowCount) {
      await db.query('ROLLBACK');
      return { kind: 'not_found' } as const;
    }

    if (current.rows[0].curriculum_slot) {
      await db.query('ROLLBACK');
      return { kind: 'fixed' } as const;
    }

    const { rows } = await db.query<AdminTopicDetail>(
      `UPDATE program_topics AS t
       SET title = $2, category = $3, level = $4,
           aliases = CASE WHEN title_key <> program_topic_name($2) AND title_key <> '' AND NOT (title_key = ANY(aliases))
                     THEN array_append(aliases, title_key) ELSE aliases END
       WHERE key = $1 AND NOT EXISTS (
         SELECT 1 FROM program_topics other
         WHERE other.key <> t.key AND NOT other.curriculum_slot AND (
           (other.category = $3 AND other.title_key = program_topic_name($2))
           OR other.key = program_topic_name($2) OR program_topic_name($2) = ANY(other.aliases)
         )
       )
       RETURNING key, title, category, level, aliases, study_content AS study, curriculum_id AS "curriculumId", curriculum_slot AS "curriculumSlot"`,
      [topic.key, topic.title, topic.category, topic.level],
    );
    await db.query('COMMIT');
    return rows[0] ? { kind: 'ok', topic: rows[0] } as const : { kind: 'duplicate' } as const;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
