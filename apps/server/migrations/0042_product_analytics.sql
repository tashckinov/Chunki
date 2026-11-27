ALTER TABLE daily_learning_plans ADD COLUMN time_zone text;

CREATE TABLE product_events (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  content_type text,
  content_id text,
  journey_id uuid,
  source text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, event_id)
);
CREATE INDEX product_events_time ON product_events (occurred_at DESC);
CREATE INDEX product_events_user_time ON product_events (user_id, occurred_at DESC);
CREATE INDEX product_events_name_time ON product_events (name, occurred_at DESC);
CREATE INDEX product_events_content_time ON product_events (content_type, content_id, occurred_at DESC);

CREATE TABLE notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  attempted_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  clicked_at timestamptz
);
CREATE INDEX notification_deliveries_time ON notification_deliveries (scheduled_at DESC);
CREATE INDEX notification_deliveries_user_time ON notification_deliveries (user_id, attempted_at DESC);

-- Reuse durable domain facts, including historical rows, without copying progress snapshots.
CREATE VIEW product_activity AS
SELECT user_id, event_id::text AS event_id, name, occurred_at, content_type, content_id, journey_id::text,
  source, properties FROM product_events
UNION ALL SELECT id, 'user:' || id, 'registered', created_at, NULL, NULL, NULL, 'server', '{}' FROM users
UNION ALL SELECT user_id, 'placement:' || id, 'placement_completed', created_at, 'placement', coalesce(variant_id::text, 'builtin'), id::text,
  'server', jsonb_build_object('level', overall_level, 'goal', to_level) FROM placement_tests
UNION ALL SELECT user_id, 'program:' || id, 'program_prepared', program_built_at, NULL, NULL, id::text,
  'server', '{}' FROM placement_tests WHERE program_built_at IS NOT NULL
UNION ALL SELECT t.user_id, 'attempt-start:' || a.id, 'topic_check_started', a.created_at, 'topic', t.catalog_key, a.id::text,
  t.source, jsonb_build_object('kind', a.kind) FROM topic_attempts a JOIN user_topics t ON t.id = a.user_topic_id
UNION ALL SELECT t.user_id, 'attempt-end:' || a.id, 'topic_check_completed', a.graded_at, 'topic', t.catalog_key, a.id::text,
  t.source, jsonb_build_object('kind', a.kind, 'passed', a.passed, 'score', a.score_out_of_10)
  FROM topic_attempts a JOIN user_topics t ON t.id = a.user_topic_id WHERE a.graded_at IS NOT NULL
UNION ALL SELECT d.user_id, e.name || ':' || d.id, e.name, e.instant, 'notification', d.id::text, d.id::text,
  'server', jsonb_strip_nulls(jsonb_build_object('kind', 'study_reminder', 'scheduledAt', d.scheduled_at,
    'error', CASE WHEN e.name = 'notification_failed' THEN d.failure_code END))
  FROM notification_deliveries d CROSS JOIN LATERAL (VALUES
    ('notification_send_attempted', d.attempted_at), ('notification_sent', d.accepted_at),
    ('notification_failed', d.failed_at), ('notification_clicked', d.clicked_at)
  ) e(name, instant) WHERE e.instant IS NOT NULL;

CREATE FUNCTION record_card_progress_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO product_events (user_id, event_id, name, occurred_at, content_type, content_id, source, properties)
  SELECT NEW.user_id, gen_random_uuid(), change.name, now(), 'card', NEW.chunk_id::text, 'server',
    jsonb_build_object('state', NEW.state)
  FROM (VALUES
    ('card_reviewed', NEW.times_reviewed > coalesce(OLD.times_reviewed, 0)),
    ('card_first_mastered', NEW.state = 'active' AND coalesce(OLD.times_production_passed, 0) = 0 AND NEW.times_production_passed > 0)
  ) change(name, happened) WHERE change.happened;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_card_progress AFTER INSERT OR UPDATE ON chunk_progress
FOR EACH ROW EXECUTE FUNCTION record_card_progress_activity();

CREATE FUNCTION record_reminder_schedule_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR (OLD.local_time, OLD.time_zone, OLD.days) IS DISTINCT FROM (NEW.local_time, NEW.time_zone, NEW.days) THEN
    INSERT INTO product_events (user_id, event_id, name, occurred_at, source, properties)
    VALUES (NEW.user_id, gen_random_uuid(),
      CASE WHEN TG_OP = 'INSERT' OR OLD.user_id IS DISTINCT FROM NEW.user_id THEN 'reminder_enabled' ELSE 'reminder_schedule_changed' END,
      now(), 'server', jsonb_build_object('time', NEW.local_time, 'zone', NEW.time_zone, 'days', NEW.days));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_reminder_schedule AFTER INSERT OR UPDATE OF user_id, local_time, time_zone, days ON study_reminders
FOR EACH ROW EXECUTE FUNCTION record_reminder_schedule_activity();
