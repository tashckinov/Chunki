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
     WHERE $1::text[] IS NULL OR level = ANY($1) ORDER BY topic_number`,
    [target ? topicLevels('A1', target) : null],
  );
  return rows;
}

export async function findCurriculumTopic(id: string): Promise<CurriculumTopic | undefined> {
  const { rows: [topic] } = await pool.query<CurriculumTopic>('SELECT * FROM curriculum_topics WHERE id = $1', [id]);
  return topic;
}

const PROGRAM_CATEGORY: Record<CurriculumTopic['category'], TopicCategory> = {
  Grammar: 'Грамматика', Vocabulary: 'Лексика', Functions: 'Использование языка',
  Discourse: 'Использование языка', Reading: 'Понимание', Writing: 'Письмо',
  Listening: 'Понимание', Speaking: 'Использование языка', Topics: 'Лексика',
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
         WHERE u.user_id = $3 AND u.withdrawn_at IS NULL AND p.curriculum_id = c.id
       )`,
    [candidates.map(({ key }) => key), levels, userId],
  );
  const available = new Map(rows.map((topic) => [topic.id, topic]));
  const selected = candidates.flatMap(({ key, rationale }) => {
    const topic = available.get(key);
    if (!topic) return [];
    available.delete(key);
    return [{ ...topic, category: PROGRAM_CATEGORY[topic.category], rationale }];
  });
  if (!selected.length) return [];

  // Each slot shares only the generated curriculum material. Authored lessons
  // linked to the same curriculum entry keep their original content.
  const { rows: slots } = await db.query<{ key: string; curriculum_id: string }>(
    `INSERT INTO program_topics (key, title, category, level, curriculum_id, curriculum_slot)
     SELECT 'curriculum-' || gen_random_uuid(), title, category, level, id, true
     FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS topics(id, title, category, level)
     ON CONFLICT (curriculum_id) WHERE curriculum_slot
     DO UPDATE SET curriculum_id = EXCLUDED.curriculum_id
     RETURNING key, curriculum_id`,
    [selected.map((topic) => topic.id), selected.map((topic) => topic.title),
      selected.map((topic) => topic.category), selected.map((topic) => topic.level)],
  );
  const keys = new Map(slots.map((slot) => [slot.curriculum_id, slot.key]));
  return selected.map(({ id, title, category, level, rationale }) => ({ key: keys.get(id)!, title, category, level, rationale }));
}

export async function createCurriculumTopic(topic: CurriculumTopic): Promise<CurriculumTopic | null> {
  const { rows } = await pool.query<CurriculumTopic>(
    `WITH curriculum AS (
       INSERT INTO curriculum_topics (id, title, level, category, objective, subtopics)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING *
     ), slot AS (
       INSERT INTO program_topics (key, title, category, level, curriculum_id, curriculum_slot)
       SELECT 'curriculum-' || gen_random_uuid(), title, $7, level, id, true FROM curriculum
     )
     SELECT * FROM curriculum`,
    [topic.id, topic.title, topic.level, topic.category, topic.objective, topic.subtopics, PROGRAM_CATEGORY[topic.category]],
  );
  return rows[0] ?? null;
}

export async function updateCurriculumTopic(topic: CurriculumTopic): Promise<CurriculumTopic | null> {
  const { rows } = await pool.query<CurriculumTopic>(
    `WITH curriculum AS (
       UPDATE curriculum_topics SET title = $2, level = $3, category = $4, objective = $5, subtopics = $6
       WHERE id = $1 RETURNING *
     ), slot AS (
       UPDATE program_topics p SET title = c.title, category = $7, level = c.level
       FROM curriculum c WHERE p.curriculum_slot AND p.curriculum_id = c.id
     )
     SELECT * FROM curriculum`,
    [topic.id, topic.title, topic.level, topic.category, topic.objective, topic.subtopics, PROGRAM_CATEGORY[topic.category]],
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
  variants?: Pick<AdminTopicDetail, 'key' | 'title' | 'curriculumSlot'>[];
}

export async function listTopicsForReview(search: string, offset: number) {
  const pageSize = 50;
  const { rows } = await pool.query<TopicIdentity & { topicNumber: number | null }>(
    `WITH ranked AS (
       SELECT p.key, p.title, p.category, p.level, p.title_key, c.topic_number AS "topicNumber",
         row_number() OVER (topic_group ORDER BY p.curriculum_slot DESC, p.key) AS position,
         bool_or(CASE WHEN $1 ~ '^[№#]? *[0-9]+$' THEN c.topic_number::text = ltrim($1, '№# ')
           ELSE $1 = '' OR strpos(p.title_key, program_topic_name($1)) > 0
             OR strpos(p.key, program_topic_name($1)) > 0
             OR EXISTS (SELECT 1 FROM unnest(p.aliases) AS a WHERE strpos(a, program_topic_name($1)) > 0)
         END) OVER topic_group AS matched
       FROM program_topics p LEFT JOIN curriculum_topics c ON c.id = p.curriculum_id
       WINDOW topic_group AS (PARTITION BY p.curriculum_id, CASE WHEN p.curriculum_id IS NULL THEN p.key END)
     )
     SELECT key, title, category, level, "topicNumber" FROM ranked
     WHERE position = 1 AND matched
     ORDER BY "topicNumber" NULLS LAST, title_key, key LIMIT $2 OFFSET $3`,
    [search, pageSize + 1, offset],
  );
  return { topics: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}

export async function getTopicForReview(key: string): Promise<AdminTopicDetail | null> {
  const { rows } = await pool.query<AdminTopicDetail>(
    `SELECT p.key, p.title, p.category, p.level, p.aliases, p.study_content AS study,
       p.curriculum_id AS "curriculumId", p.curriculum_slot AS "curriculumSlot",
       ARRAY(
         SELECT jsonb_build_object('key', v.key, 'title', v.title, 'curriculumSlot', v.curriculum_slot)
         FROM program_topics v WHERE v.curriculum_id = p.curriculum_id AND v.key <> p.key
         ORDER BY v.curriculum_slot DESC, v.title_key, v.key
       ) AS variants
     FROM program_topics p WHERE p.key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function updateTopicStudyForReview(key: string, study: TopicStudyContent): Promise<TopicStudyContent | null> {
  const { rows } = await pool.query<{ study: TopicStudyContent }>(
    'UPDATE program_topics SET study_content = $2::jsonb WHERE key = $1 RETURNING study_content AS study',
    [key, JSON.stringify(study)],
  );
  return rows[0]?.study ?? null;
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
