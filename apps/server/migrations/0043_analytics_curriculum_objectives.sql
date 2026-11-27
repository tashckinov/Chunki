-- Keep the historical objective even if the lesson is later relinked.
-- Existing mappings may have changed, so historical rows remain unattributed.
ALTER TABLE user_topics ADD COLUMN curriculum_objective_id text;
ALTER TABLE topic_attempts ADD COLUMN curriculum_objective_id text,
  ADD COLUMN assignment_source text;
ALTER TABLE product_events ADD COLUMN curriculum_objective_id text,
  ADD COLUMN assignment_id uuid;
CREATE INDEX product_events_objective_time ON product_events (curriculum_objective_id, occurred_at)
  WHERE curriculum_objective_id IS NOT NULL;
CREATE INDEX topic_attempts_objective_created ON topic_attempts (curriculum_objective_id, created_at)
  WHERE curriculum_objective_id IS NOT NULL;

CREATE FUNCTION snapshot_assignment_objective() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT p.curriculum_id INTO NEW.curriculum_objective_id FROM program_topics p WHERE p.key = NEW.catalog_key;
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_topic_objective BEFORE INSERT ON user_topics
FOR EACH ROW EXECUTE FUNCTION snapshot_assignment_objective();

CREATE FUNCTION record_topic_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO product_events (user_id, event_id, name, occurred_at, content_type, content_id, source,
    curriculum_objective_id, assignment_id)
  VALUES (NEW.user_id, gen_random_uuid(), 'topic_assigned', NEW.created_at, 'topic', NEW.catalog_key, NEW.source,
    NEW.curriculum_objective_id, NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER product_topic_assignment AFTER INSERT ON user_topics
FOR EACH ROW EXECUTE FUNCTION record_topic_assignment();

CREATE FUNCTION snapshot_attempt_objective() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT t.curriculum_objective_id, t.source INTO NEW.curriculum_objective_id, NEW.assignment_source
  FROM user_topics t WHERE t.id = NEW.user_topic_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER topic_attempt_objective BEFORE INSERT ON topic_attempts
FOR EACH ROW EXECUTE FUNCTION snapshot_attempt_objective();

CREATE OR REPLACE VIEW product_activity AS
SELECT user_id, event_id::text AS event_id, name, occurred_at, content_type, content_id, journey_id::text,
  source, properties, curriculum_objective_id, assignment_id FROM product_events
UNION ALL SELECT id, 'user:' || id, 'registered', created_at, NULL, NULL, NULL, 'server', '{}', NULL, NULL FROM users
UNION ALL SELECT user_id, 'placement:' || id, 'placement_completed', created_at, 'placement', coalesce(variant_id::text, 'builtin'), id::text,
  'server', jsonb_build_object('level', overall_level, 'goal', to_level), NULL, NULL FROM placement_tests
UNION ALL SELECT user_id, 'program:' || id, 'program_prepared', program_built_at, NULL, NULL, id::text,
  'server', '{}', NULL, NULL FROM placement_tests WHERE program_built_at IS NOT NULL
UNION ALL SELECT t.user_id, 'attempt-start:' || a.id, 'topic_check_started', a.created_at, 'topic', t.catalog_key, a.id::text,
  coalesce(a.assignment_source, t.source), jsonb_build_object('kind', a.kind), a.curriculum_objective_id, t.id FROM topic_attempts a JOIN user_topics t ON t.id = a.user_topic_id
UNION ALL SELECT t.user_id, 'attempt-end:' || a.id, 'topic_check_completed', a.graded_at, 'topic', t.catalog_key, a.id::text,
  coalesce(a.assignment_source, t.source), jsonb_build_object('kind', a.kind, 'passed', a.passed, 'score', a.score_out_of_10), a.curriculum_objective_id, t.id
  FROM topic_attempts a JOIN user_topics t ON t.id = a.user_topic_id WHERE a.graded_at IS NOT NULL
UNION ALL SELECT d.user_id, e.name || ':' || d.id, e.name, e.instant, 'notification', d.id::text, d.id::text,
  'server', jsonb_strip_nulls(jsonb_build_object('kind', 'study_reminder', 'scheduledAt', d.scheduled_at,
    'error', CASE WHEN e.name = 'notification_failed' THEN d.failure_code END)), NULL, NULL
  FROM notification_deliveries d CROSS JOIN LATERAL (VALUES
    ('notification_send_attempted', d.attempted_at), ('notification_sent', d.accepted_at),
    ('notification_failed', d.failed_at), ('notification_clicked', d.clicked_at)
  ) e(name, instant) WHERE e.instant IS NOT NULL;
