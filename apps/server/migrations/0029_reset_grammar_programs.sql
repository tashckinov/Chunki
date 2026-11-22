ALTER TABLE curriculum_topics
  ADD COLUMN topic_number integer GENERATED ALWAYS AS IDENTITY UNIQUE;

-- A successful program build is recorded on the test it used. Keep all
-- existing tests and leave them eligible for one rebuild.
ALTER TABLE placement_tests ADD COLUMN program_built_at timestamptz;

-- Intentional one-time reset of learner assignments, including their progress.
-- Topic attempts and redirects cascade. Placement results and shared lessons
-- are independent and remain available.
DELETE FROM user_topics;
