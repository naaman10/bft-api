-- Optional points goal for a student. Unset until something writes a value.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS target_points INTEGER
  CHECK (target_points IS NULL OR target_points >= 0);
