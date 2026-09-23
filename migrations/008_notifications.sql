-- Notifications for learners
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Core fields
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'assignment',
    'assessment',
    'reward',
    'feedback',
    'status_change',
    'milestone'
  )),
  
  -- Status tracking
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  -- Notification content
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Structured metadata (JSONB for flexibility)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Reference links
  enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  content_id TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance (optimized for polling queries)
CREATE INDEX IF NOT EXISTS notifications_student_id_idx 
  ON notifications (student_id);

-- Composite index for common query pattern (student's recent notifications, unread first)
CREATE INDEX IF NOT EXISTS notifications_student_read_created_idx 
  ON notifications (student_id, read, created_at DESC);

-- Partial index for unread notifications (lightweight unread count queries)
CREATE INDEX IF NOT EXISTS notifications_student_unread_idx 
  ON notifications (student_id) 
  WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS notifications_type_idx 
  ON notifications (type);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx 
  ON notifications (created_at DESC);

-- Index for cleanup job (finding old read notifications)
CREATE INDEX IF NOT EXISTS notifications_cleanup_idx
  ON notifications (read, read_at)
  WHERE read = TRUE AND read_at IS NOT NULL;
