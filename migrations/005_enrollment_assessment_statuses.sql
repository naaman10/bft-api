-- Keep existing databases aligned with the assessment workflow.
ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_progress_status_check;

ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_progress_status_check
  CHECK (progress_status IN (
    'not_started',
    'in_progress',
    'completed',
    'to_assess',
    'assessed'
  ));
