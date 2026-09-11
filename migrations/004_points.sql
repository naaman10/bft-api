-- Positive point awards. Incorrect and unassessed answers do not create rows.
CREATE TABLE IF NOT EXISTS points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  content_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  points_earned INTEGER NOT NULL CHECK (points_earned > 0),
  points_available INTEGER NOT NULL CHECK (points_available > 0),
  source TEXT NOT NULL CHECK (source IN ('automatic', 'assessment')),
  awarded_by TEXT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (student_id, content_id)
    REFERENCES enrollments(student_id, content_id)
    ON DELETE CASCADE,
  CHECK (points_earned <= points_available),
  UNIQUE (student_id, question_id)
);

CREATE INDEX IF NOT EXISTS points_student_id_idx ON points (student_id);
CREATE INDEX IF NOT EXISTS points_content_id_idx ON points (content_id);
CREATE INDEX IF NOT EXISTS points_question_id_idx ON points (question_id);
