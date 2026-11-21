import type { PoolClient } from 'pg';
import { CEFR_LEVELS, type CEFRLevel, type TopicIdentity, type TopicStudyContent, type TopicSuggestion } from '@app/shared';
import { pool } from '../../db/pool.js';

export function topicLevels(current: CEFRLevel, target: CEFRLevel): readonly CEFRLevel[] {
  const end = CEFR_LEVELS.indexOf(target);
  return CEFR_LEVELS.slice(Math.min(CEFR_LEVELS.indexOf(current), end), end + 1);
}

export async function listTopicCatalog(target: CEFRLevel): Promise<TopicIdentity[]> {
  const { rows } = await pool.query<TopicIdentity>(
    `SELECT key, title, category, level FROM program_topics
     WHERE level IS NULL OR level = ANY($1::text[])
     ORDER BY (cardinality(aliases) > 0) DESC, key LIMIT 80`,
    [topicLevels('A1', target)],
  );
  return rows;
}

async function findCatalogTopic(db: PoolClient, candidate: TopicSuggestion): Promise<TopicIdentity | undefined> {
  const { rows } = await db.query<TopicIdentity>(
    `SELECT key, title, category, level FROM program_topics
     WHERE key = $1 OR (category = $3 AND title_key = program_topic_name($2))
       OR aliases && ARRAY[program_topic_name($1), program_topic_name($2)]
     ORDER BY (key = $1) DESC, (title_key = program_topic_name($2)) DESC, key LIMIT 1`,
    [candidate.key, candidate.title, candidate.category],
  );
  return rows[0];
}

export async function resolveTopics(
  db: PoolClient,
  candidates: TopicSuggestion[],
  levels: readonly CEFRLevel[],
  assigned: ReadonlySet<string>,
): Promise<TopicSuggestion[]> {
  if (candidates.length === 0 || levels.length === 0) return [];
  // Both review flows write only after grading. Serialize catalog decisions in
  // these short transactions so concurrent submissions reuse the same records.
  await db.query("SELECT pg_advisory_xact_lock(hashtext('program-topic-catalog'))");
  const resolved = new Map<string, TopicSuggestion>();
  for (const candidate of candidates) {
    const title = candidate.title.trim();
    if (!title) continue;
    const existing = await findCatalogTopic(db, candidate);
    const level = existing?.level ?? candidate.level;
    const key = existing?.key ?? candidate.key;
    if (!levels.includes(level) || resolved.has(key)) continue;
    if (assigned.has(key) && existing?.level) continue;

    if (!existing) {
      await db.query(
        'INSERT INTO program_topics (key, title, category, level) VALUES ($1, $2, $3, $4)',
        [key, title, candidate.category, level],
      );
    } else if (!existing.level) {
      await db.query('UPDATE program_topics SET level = $2, study_content = NULL WHERE key = $1', [key, level]);
    }

    if (assigned.has(key)) continue;
    resolved.set(key, { key, title: existing?.title ?? title,
      category: existing?.category ?? candidate.category, level, rationale: candidate.rationale });
  }
  return [...resolved.values()];
}

export async function saveCatalogStudy(topic: TopicIdentity, study: TopicStudyContent): Promise<TopicStudyContent> {
  const { rows } = await pool.query<{ study_content: TopicStudyContent }>(
    `UPDATE program_topics SET study_content = COALESCE(study_content, $3::jsonb)
     WHERE key = $1 AND level IS NOT DISTINCT FROM $2 RETURNING study_content`,
    [topic.key, topic.level, JSON.stringify(study)],
  );
  return rows[0]?.study_content ?? study;
}

export interface AdminTopicDetail extends TopicIdentity {
  aliases: string[];
  study: TopicStudyContent | null;
}

export async function listTopicsForReview(search: string, offset: number) {
  const pageSize = 50;
  const { rows } = await pool.query<TopicIdentity>(
    `SELECT key, title, category, level FROM program_topics
     WHERE $1 = '' OR strpos(title_key, program_topic_name($1)) > 0
       OR strpos(key, program_topic_name($1)) > 0
       OR EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE strpos(a, program_topic_name($1)) > 0)
     ORDER BY title_key, key LIMIT $2 OFFSET $3`,
    [search, pageSize + 1, offset],
  );
  return { topics: rows.slice(0, pageSize), nextOffset: rows.length > pageSize ? offset + pageSize : null };
}

export async function getTopicForReview(key: string): Promise<AdminTopicDetail | null> {
  const { rows } = await pool.query<AdminTopicDetail>(
    'SELECT key, title, category, level, aliases, study_content AS study FROM program_topics WHERE key = $1', [key],
  );
  return rows[0] ?? null;
}

export async function updateTopicForReview(topic: TopicIdentity) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('program-topic-catalog'))");
    const current = await db.query('SELECT 1 FROM program_topics WHERE key = $1', [topic.key]);
    if (!current.rowCount) {
      await db.query('ROLLBACK');
      return { kind: 'not_found' } as const;
    }

    const { rows } = await db.query<AdminTopicDetail>(
      `UPDATE program_topics AS t
       SET title = $2, category = $3, level = $4,
           aliases = CASE WHEN title_key <> program_topic_name($2) AND title_key <> '' AND NOT (title_key = ANY(aliases))
                     THEN array_append(aliases, title_key) ELSE aliases END
       WHERE key = $1 AND NOT EXISTS (
         SELECT 1 FROM program_topics other
         WHERE other.key <> t.key AND (
           (other.category = $3 AND other.title_key = program_topic_name($2))
           OR other.key = program_topic_name($2) OR program_topic_name($2) = ANY(other.aliases)
         )
       )
       RETURNING key, title, category, level, aliases, study_content AS study`,
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
