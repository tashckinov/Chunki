import { z } from 'zod';
import { pool } from '../../db/pool.js';

export const clientEvent = z.object({
  id: z.string().uuid(),
  name: z.enum([
    'app_opened', 'placement_started', 'placement_result_viewed', 'program_opened', 'topic_opened', 'topic_study_started',
    'collection_opened', 'deck_started', 'card_viewed', 'deck_completed', 'comic_opened', 'comic_completed',
    'notification_permission_granted', 'notification_permission_denied',
  ]),
  at: z.string().datetime(),
  contentId: z.string().max(120).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  journeyId: z.string().uuid().optional(),
  context: z.enum(['recommended', 'independent', 'review', 'read', 'deck', 'browse', 'first', 'retest']).optional(),
});

const contentTypes: Partial<Record<z.infer<typeof clientEvent>['name'], string>> = {
  placement_started: 'placement', placement_result_viewed: 'placement', topic_opened: 'topic', topic_study_started: 'topic',
  collection_opened: 'collection', deck_started: 'collection', card_viewed: 'card', deck_completed: 'collection',
  comic_opened: 'comic', comic_completed: 'comic',
};

export async function recordClientEvents(userId: string, events: z.infer<typeof clientEvent>[]) {
  const records = events.map((event) => ({ ...event, contentType: contentTypes[event.name] }));
  await pool.query(`
    INSERT INTO product_events (user_id, event_id, name, occurred_at, content_type, content_id, journey_id, source, properties, curriculum_objective_id, assignment_id)
    SELECT $1, e.id, e.name, least(e.at, now()), e."contentType",
      CASE WHEN e."contentType" = 'topic' THEN t.catalog_key ELSE e."contentId" END,
      e."journeyId", 'client', jsonb_strip_nulls(jsonb_build_object('context', e.context)), t.curriculum_objective_id, t.id
    FROM jsonb_to_recordset($2::jsonb)
      AS e(id uuid, name text, at timestamptz, "contentType" text, "contentId" text, "journeyId" uuid, context text)
    LEFT JOIN user_topics t ON e."contentType" = 'topic' AND t.id::text = e."contentId" AND t.user_id = $1
    WHERE e.at >= now() - interval '30 days' AND (e."contentType" IS DISTINCT FROM 'topic' OR t.id IS NOT NULL)
    ON CONFLICT (user_id, event_id) DO NOTHING
  `, [userId, JSON.stringify(records)]);
}
