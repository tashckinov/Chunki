UPDATE user_topics
SET status = CASE WHEN status = 'passed_once' THEN 'mastered' ELSE status END,
    mastered_at = CASE WHEN status = 'passed_once' THEN COALESCE(passed_once_at, updated_at) ELSE mastered_at END,
    next_review_at = NULL
WHERE source = 'self' AND (status = 'passed_once' OR next_review_at IS NOT NULL);
