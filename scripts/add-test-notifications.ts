import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const STUDENT_ID = "815d58f0-0a91-4ac2-86af-5ae178c0042e";

async function addTestNotifications() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const sql = neon(connectionString);

  console.log(`Adding test notifications for student ${STUDENT_ID}...\n`);

  // 1. Assignment notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      content_id
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'assignment',
      'New Assignment',
      'You have been assigned: Introduction to Algebra',
      '{"contentName": "Introduction to Algebra", "contentType": "Lesson", "subject": "Maths"}'::jsonb,
      'test-content-1'
    )
  `;
  console.log("✅ Added assignment notification");

  // 2. Assessment notification (read)
  await sql`
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
      ${STUDENT_ID}::uuid,
      'assessment',
      'Assessment Graded',
      'Your English Essay has been graded. You earned 85 points!',
      '{"contentName": "English Essay", "pointsEarned": 85, "pointsAvailable": 100, "hasFeedback": true}'::jsonb,
      true,
      NOW() - INTERVAL '2 hours',
      'test-content-2'
    )
  `;
  console.log("✅ Added assessment notification (read)");

  // 3. Reward notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      content_id
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'reward',
      'Points Earned!',
      'You earned 10 points for completing a question!',
      '{"contentName": "Maths Quiz", "pointsEarned": 10, "pointsAvailable": 10, "source": "automatic"}'::jsonb,
      'test-content-3'
    )
  `;
  console.log("✅ Added reward notification");

  // 4. Another reward notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      content_id
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'reward',
      'Points Earned!',
      'You earned 5 points for completing a question!',
      '{"contentName": "Science Test", "pointsEarned": 5, "pointsAvailable": 5, "source": "automatic"}'::jsonb,
      'test-content-4'
    )
  `;
  console.log("✅ Added another reward notification");

  // 5. Feedback notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      content_id
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'feedback',
      'New Feedback',
      'Your teacher left feedback on History Assignment',
      '{"contentName": "History Assignment", "feedbackPreview": "Great work on your analysis! Consider adding more details about..."}'::jsonb,
      'test-content-5'
    )
  `;
  console.log("✅ Added feedback notification");

  // 6. Status change notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      content_id
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'status_change',
      'Assessment Ready for Grading',
      'Your Physics Lab Report is ready for grading',
      '{"contentName": "Physics Lab Report", "oldStatus": "completed", "newStatus": "to_assess"}'::jsonb,
      'test-content-6'
    )
  `;
  console.log("✅ Added status change notification");

  // 7. Milestone notification
  await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata
    ) VALUES (
      ${STUDENT_ID}::uuid,
      'milestone',
      'Milestone Reached!',
      'Congratulations! You reached 100 points!',
      '{"milestoneType": "points_target", "milestoneValue": 100, "totalPoints": 100, "targetPoints": 500}'::jsonb
    )
  `;
  console.log("✅ Added milestone notification");

  // 8. Another assignment (older, read)
  await sql`
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
      ${STUDENT_ID}::uuid,
      'assignment',
      'New Assignment',
      'You have been assigned: Shakespeare Analysis',
      '{"contentName": "Shakespeare Analysis", "contentType": "Homework", "subject": "English"}'::jsonb,
      true,
      NOW() - INTERVAL '1 day',
      'test-content-7',
      NOW() - INTERVAL '2 days'
    )
  `;
  console.log("✅ Added older assignment notification (read)");

  // Query to show summary
  const counts = await sql`
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
    WHERE student_id = ${STUDENT_ID}::uuid
  `;

  console.log("\n📊 Notification Summary:");
  console.log(`   Total: ${counts[0].total}`);
  console.log(`   Unread: ${counts[0].unread}`);
  console.log(`   Read: ${Number(counts[0].total) - Number(counts[0].unread)}`);
  console.log("\n   By Type:");
  console.log(`   - Assignments: ${counts[0].assignments}`);
  console.log(`   - Assessments: ${counts[0].assessments}`);
  console.log(`   - Rewards: ${counts[0].rewards}`);
  console.log(`   - Feedback: ${counts[0].feedback}`);
  console.log(`   - Status Changes: ${counts[0].status_changes}`);
  console.log(`   - Milestones: ${counts[0].milestones}`);

  console.log("\n✅ Test notifications added successfully!");
  console.log(`\n🔗 Test with:`);
  console.log(`   GET /learn/notifications/unread-count`);
  console.log(`   GET /learn/notifications?limit=10`);
}

addTestNotifications().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
