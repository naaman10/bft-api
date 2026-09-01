-- Student enrollments in Contentful content entries, plus JSON progress.
CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'withdrawn')),
  progress_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (progress_status IN ('not_started', 'in_progress', 'completed')),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, content_id)
);

CREATE INDEX IF NOT EXISTS enrollments_student_id_idx ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS enrollments_content_id_idx ON enrollments (content_id);
