-- Align enrollments if 002 was applied before status/progress changes.
ALTER TABLE enrollments DROP COLUMN IF EXISTS progress_percent;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE enrollments DROP CONSTRAINT IF EXISTS enrollments_status_check;
UPDATE enrollments SET status = 'enrolled' WHERE status = 'active';
ALTER TABLE enrollments ALTER COLUMN status SET DEFAULT 'enrolled';
ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check
  CHECK (status IN ('enrolled', 'withdrawn'));
