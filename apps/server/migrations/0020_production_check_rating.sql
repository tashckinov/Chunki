ALTER TABLE ai_call_logs
ADD COLUMN rating TEXT CHECK (rating IN ('up', 'down'));
