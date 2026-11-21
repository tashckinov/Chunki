ALTER TABLE users
  ADD COLUMN study_intro_completed_at TIMESTAMPTZ,
  ADD COLUMN daily_card_goal INTEGER CHECK (daily_card_goal IN (5, 10, 15, 20));

-- Learners who already studied at least four distinct chunks can go straight to the survey.
UPDATE users
SET study_intro_completed_at = now()
WHERE id IN (
  SELECT user_id FROM chunk_progress
  WHERE times_reviewed > 0
  GROUP BY user_id
  HAVING count(*) >= 4
);
