ALTER TABLE program_topics ADD COLUMN verified boolean NOT NULL DEFAULT false;
ALTER TABLE program_topics ADD CONSTRAINT verified_topic_has_study CHECK (NOT verified OR study_content IS NOT NULL);

CREATE FUNCTION reset_program_topic_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.study_content IS DISTINCT FROM OLD.study_content THEN
    NEW.verified := false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reset_program_topic_verification
BEFORE UPDATE OF study_content ON program_topics
FOR EACH ROW EXECUTE FUNCTION reset_program_topic_verification();
