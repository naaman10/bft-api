-- Test notifications for student 815d58f0-0a91-4ac2-86af-5ae178c0042e
-- Run this after the notification migration (008_notifications.sql)

-- 1. Assignment notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'assignment',
  'New Assignment',
  'You have been assigned: Introduction to Algebra',
  '{"contentName": "Introduction to Algebra", "contentType": "Lesson", "subject": "Maths"}'::jsonb,
  'test-content-1'
);

-- 2. Assessment notification (read)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  read,
  read_at,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'assessment',
  'Assessment Graded',
  'Your English Essay has been graded. You earned 85 points!',
  '{"contentName": "English Essay", "pointsEarned": 85, "pointsAvailable": 100, "hasFeedback": true}'::jsonb,
  true,
  NOW() - INTERVAL '2 hours',
  'test-content-2'
);

-- 3. Reward notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'reward',
  'Points Earned!',
  'You earned 10 points for completing a question!',
  '{"contentName": "Maths Quiz", "pointsEarned": 10, "pointsAvailable": 10, "source": "automatic"}'::jsonb,
  'test-content-3'
);

-- 4. Another reward notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'reward',
  'Points Earned!',
  'You earned 5 points for completing a question!',
  '{"contentName": "Science Test", "pointsEarned": 5, "pointsAvailable": 5, "source": "automatic"}'::jsonb,
  'test-content-4'
);

-- 5. Feedback notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'feedback',
  'New Feedback',
  'Your teacher left feedback on History Assignment',
  '{"contentName": "History Assignment", "feedbackPreview": "Great work on your analysis! Consider adding more details about..."}'::jsonb,
  'test-content-5'
);

-- 6. Status change notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  content_id
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'status_change',
  'Assessment Ready for Grading',
  'Your Physics Lab Report is ready for grading',
  '{"contentName": "Physics Lab Report", "oldStatus": "completed", "newStatus": "to_assess"}'::jsonb,
  'test-content-6'
);

-- 7. Milestone notification (unread)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'milestone',
  'Milestone Reached!',
  'Congratulations! You reached 100 points!',
  '{"milestoneType": "points_target", "milestoneValue": 100, "totalPoints": 100, "targetPoints": 500}'::jsonb
);

-- 8. Older assignment notification (read)
INSERT INTO notifications (
  student_id,
  type,
  title,
  message,
  metadata,
  read,
  read_at,
  content_id,
  created_at
) VALUES (
  '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid,
  'assignment',
  'New Assignment',
  'You have been assigned: Shakespeare Analysis',
  '{"contentName": "Shakespeare Analysis", "contentType": "Homework", "subject": "English"}'::jsonb,
  true,
  NOW() - INTERVAL '1 day',
  'test-content-7',
  NOW() - INTERVAL '2 days'
);

-- Verify the notifications were created
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE read = FALSE) as unread,
  COUNT(*) FILTER (WHERE type = 'assignment') as assignments,
  COUNT(*) FILTER (WHERE type = 'assessment') as assessments,
  COUNT(*) FILTER (WHERE type = 'reward') as rewards,
  COUNT(*) FILTER (WHERE type = 'feedback') as feedback,
  COUNT(*) FILTER (WHERE type = 'status_change') as status_changes,
  COUNT(*) FILTER (WHERE type = 'milestone') as milestones
FROM notifications
WHERE student_id = '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid;

-- View the notifications
SELECT 
  id,
  type,
  title,
  read,
  created_at
FROM notifications
WHERE student_id = '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid
ORDER BY created_at DESC;
