import {
  topicStudySchema, type CurriculumTopic, type TopicIdentity, type TopicLevelStudy, type TopicStudyContent, type TopicStudyLevel,
} from '@app/shared';
import { pool } from '../../db/pool.js';
import { getGradingProvider } from '../../grading/index.js';
import { withAiCallLogging } from '../aiLogs/service.js';

export async function readTopicLevelStudy(key: string, level: TopicStudyLevel): Promise<TopicLevelStudy> {
  const { rows: [row] } = await pool.query<Omit<TopicLevelStudy, 'level'>>(
    `SELECT study_content AS study, COALESCE(generation_expires_at > now(), false) AS generating
     FROM topic_level_studies WHERE topic_key = $1 AND level = $2`,
    [key, level],
  );
  return { level, study: row?.study ?? null, generating: row?.generating ?? false };
}

export async function saveTopicLevelStudy(key: string, level: TopicStudyLevel, study: TopicStudyContent): Promise<void> {
  await pool.query(
    `INSERT INTO topic_level_studies (topic_key, level, study_content)
     VALUES ($1, $2, $3)
     ON CONFLICT (topic_key, level) DO UPDATE
     SET study_content = EXCLUDED.study_content, generation_token = NULL, generation_expires_at = NULL`,
    [key, level, study],
  );
}

export async function generateTopicLevelStudy(
  actorId: string, topic: TopicIdentity, level: TopicStudyLevel, curriculum?: CurriculumTopic,
): Promise<TopicLevelStudy> {
  // Take a short-lived lease without holding a DB connection during the AI call.
  const { rows: [lease] } = await pool.query<{ generation_token: string }>(
    `INSERT INTO topic_level_studies (topic_key, level, generation_token, generation_expires_at)
     VALUES ($1, $2, gen_random_uuid(), now() + interval '90 seconds')
     ON CONFLICT (topic_key, level) DO UPDATE
     SET generation_token = EXCLUDED.generation_token, generation_expires_at = EXCLUDED.generation_expires_at
     WHERE topic_level_studies.study_content IS NULL
       AND (topic_level_studies.generation_expires_at IS NULL OR topic_level_studies.generation_expires_at <= now())
     RETURNING generation_token`,
    [topic.key, level],
  );
  if (!lease) return readTopicLevelStudy(topic.key, level);

  const params = [topic.key, level, lease.generation_token];
  try {
    const provider = getGradingProvider();
    const study = await withAiCallLogging({
      userId: actorId, chunkId: null, provider: provider.name, model: provider.model ?? null,
      request: { topic: curriculum ?? topic, learnerLevel: level },
    }, async () => topicStudySchema.parse(await provider.generateTopicStudy(topic, curriculum, level)));

    // A manual save wins even if AI generation was already in flight.
    await pool.query(
      `UPDATE topic_level_studies SET study_content = $4, generation_token = NULL, generation_expires_at = NULL
       WHERE topic_key = $1 AND level = $2 AND generation_token = $3`,
      [...params, study],
    );
    return readTopicLevelStudy(topic.key, level);
  } catch (error) {
    await pool.query(
      `DELETE FROM topic_level_studies WHERE topic_key = $1 AND level = $2 AND generation_token = $3`,
      params,
    ).catch(() => {});
    throw error;
  }
}
