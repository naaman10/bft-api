-- Assessment tables for admin user grading and feedback

-- Main assessment record
CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
  assessed_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessments_enrollment_id_idx ON assessments (enrollment_id);
CREATE INDEX IF NOT EXISTS assessments_assessed_by_idx ON assessments (assessed_by);
CREATE INDEX IF NOT EXISTS assessments_status_idx ON assessments (status);

-- Question grades (points awarded per question)
CREATE TABLE IF NOT EXISTS assessment_question_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  points_earned INTEGER NOT NULL CHECK (points_earned >= 0),
  points_available INTEGER NOT NULL CHECK (points_available > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (points_earned <= points_available),
  UNIQUE (assessment_id, question_id)
);

CREATE INDEX IF NOT EXISTS assessment_question_grades_assessment_id_idx ON assessment_question_grades (assessment_id);
CREATE INDEX IF NOT EXISTS assessment_question_grades_question_id_idx ON assessment_question_grades (question_id);

-- Question-level feedback
CREATE TABLE IF NOT EXISTS assessment_question_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assessment_id, question_id)
);

CREATE INDEX IF NOT EXISTS assessment_question_feedback_assessment_id_idx ON assessment_question_feedback (assessment_id);
CREATE INDEX IF NOT EXISTS assessment_question_feedback_question_id_idx ON assessment_question_feedback (question_id);

-- Overall assessment feedback (not question-specific)
CREATE TABLE IF NOT EXISTS assessment_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assessment_feedback_assessment_id_idx ON assessment_feedback (assessment_id);

-- General enrollment feedback (can be added even without assessment)
CREATE TABLE IF NOT EXISTS enrollment_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  feedback TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS enrollment_feedback_enrollment_id_idx ON enrollment_feedback (enrollment_id);
CREATE INDEX IF NOT EXISTS enrollment_feedback_created_by_idx ON enrollment_feedback (created_by);
