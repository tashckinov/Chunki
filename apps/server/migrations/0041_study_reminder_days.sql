ALTER TABLE study_reminders
  ADD COLUMN days smallint[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4]::smallint[],
  ADD CONSTRAINT study_reminder_days_valid CHECK (
    cardinality(days) BETWEEN 1 AND 7 AND days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  );
