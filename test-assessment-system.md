# Testing the Assessment System

This guide walks you through testing the assessment system from scratch.

## Prerequisites Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file (already created):

```bash
# Minimum required for testing:
PORT=4000
ADMIN_API_KEY=test_admin_key_for_local_development_only_not_secure
DATABASE_URL=postgresql://user:password@host/database  # Get from Neon Console
```

**To get DATABASE_URL from Neon:**
1. Go to https://console.neon.tech
2. Select your project (mute-hall-33379341)
3. Go to Dashboard → Connection Details
4. Copy the connection string
5. Paste into `.env` as `DATABASE_URL`

### 3. Run Migrations

```bash
npm run migrate
```

This creates all 7 migration files including the new assessment tables:
- `001_students.sql`
- `002_enrollments.sql`
- `003_enrollments_progress.sql`
- `004_points.sql`
- `005_enrollment_assessment_statuses.sql`
- `006_student_target_points.sql`
- `007_assessments.sql` ← **NEW!**

### 4. Start the Server

```bash
npm run dev
```

Server will start on http://localhost:4000

## Test Sequence

### Test 1: Health Check

```bash
curl http://localhost:4000/health
```

**Expected:**
```json
{"status":"ok"}
```

### Test 2: Create Test Data

First, you need test data in the database:

#### 2.1 Create a Student

```sql
INSERT INTO students (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test Student')
RETURNING *;
```

#### 2.2 Create an Enrollment (with progress_status = 'to_assess')

```sql
INSERT INTO enrollments (
  id,
  student_id,
  content_id,
  status,
  progress_status,
  progress,
  completed_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'test-content-id',
  'enrolled',
  'to_assess',
  '{"version":1,"items":{"q1":{"status":"completed","answer":"4","updatedAt":"2026-09-22T10:00:00Z"},"q2":{"status":"completed","answer":"Paris","updatedAt":"2026-09-22T10:00:00Z"}}}'::jsonb,
  NOW()
)
RETURNING *;
```

Or use the SQL helper script:

```bash
# Save this as setup-test-data.sql
cat > setup-test-data.sql << 'EOF'
-- Clean up any existing test data
DELETE FROM enrollments WHERE student_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM students WHERE id = '00000000-0000-0000-0000-000000000001';

-- Create test student
INSERT INTO students (id, email, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test Student');

-- Create test enrollment ready for assessment
INSERT INTO enrollments (
  id,
  student_id,
  content_id,
  status,
  progress_status,
  progress,
  completed_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'test-content-id',
  'enrolled',
  'to_assess',
  '{"version":1,"items":{"q1":{"status":"completed","answer":"4","updatedAt":"2026-09-22T10:00:00Z"},"q2":{"status":"completed","answer":"Paris","updatedAt":"2026-09-22T10:00:00Z"}}}'::jsonb,
  NOW()
);

SELECT 'Test data created!' as status;
EOF

# Run with psql (you'll need the DATABASE_URL)
psql $DATABASE_URL -f setup-test-data.sql
```

### Test 3: Save Assessment (Create Draft)

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002 \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "assessedBy": "00000000-0000-0000-0000-000000000099",
    "questionGrades": [
      {
        "questionId": "q1",
        "pointsEarned": 5,
        "pointsAvailable": 10
      },
      {
        "questionId": "q2",
        "pointsEarned": 3,
        "pointsAvailable": 5
      }
    ],
    "questionFeedback": [
      {
        "questionId": "q1",
        "feedback": "Good work, but you missed the final step in your calculation."
      }
    ],
    "overallFeedback": "Overall, you demonstrated solid understanding of the concepts."
  }'
```

**Expected Response (200 OK):**
```json
{
  "assessment": {
    "id": "...",
    "enrollmentId": "00000000-0000-0000-0000-000000000002",
    "assessedBy": "00000000-0000-0000-0000-000000000099",
    "status": "in_progress",
    "startedAt": "2026-09-22T13:00:00.000Z",
    "completedAt": null,
    "createdAt": "2026-09-22T13:00:00.000Z",
    "updatedAt": "2026-09-22T13:00:00.000Z"
  },
  "questionGrades": [
    {
      "questionId": "q1",
      "pointsEarned": 5,
      "pointsAvailable": 10
    },
    {
      "questionId": "q2",
      "pointsEarned": 3,
      "pointsAvailable": 5
    }
  ],
  "questionFeedback": [
    {
      "questionId": "q1",
      "feedback": "Good work, but you missed the final step in your calculation."
    }
  ],
  "overallFeedback": "Overall, you demonstrated solid understanding of the concepts."
}
```

### Test 4: Update Assessment (Modify Draft)

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002 \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "assessedBy": "00000000-0000-0000-0000-000000000099",
    "questionGrades": [
      {
        "questionId": "q1",
        "pointsEarned": 8,
        "pointsAvailable": 10
      }
    ]
  }'
```

**Expected:** Grade for q1 updated to 8, q2 and feedback remain unchanged.

### Test 5: Get Assessment

```bash
curl -X GET http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002 \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure"
```

**Expected:** Returns current assessment state with all grades and feedback.

### Test 6: Complete Assessment

**Note:** This will fail initially because we don't have Contentful configured. You'll need to either:
1. Add Contentful credentials to `.env`
2. Or modify the test to mock the content validation

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002/complete \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "assessedBy": "00000000-0000-0000-0000-000000000099"
  }'
```

**Expected Response (200 OK):**
```json
{
  "assessment": {
    "status": "completed",
    "completedAt": "2026-09-22T13:05:00.000Z",
    ...
  },
  ...
}
```

**Database changes after completion:**
- `assessments.status` → 'completed'
- `enrollments.progress_status` → 'assessed'
- `points` table → 2 new rows (one for each non-zero grade)

### Test 7: Verify Points Were Awarded

```sql
SELECT * FROM points WHERE student_id = '00000000-0000-0000-0000-000000000001';
```

**Expected:**
```
 id | student_id | content_id | question_id | points_earned | points_available | source | awarded_by | ...
----+------------+------------+-------------+---------------+------------------+--------+------------+
... | ...        | test-...   | q1          | 8             | 10               | assessment | 00...99 |
... | ...        | test-...   | q2          | 3             | 5                | assessment | 00...99 |
```

### Test 8: Add General Feedback

```bash
curl -X POST http://localhost:4000/admin/enrollment/00000000-0000-0000-0000-000000000002/feedback \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "feedback": "Excellent progress! Keep up the good work.",
    "createdBy": "00000000-0000-0000-0000-000000000099"
  }'
```

**Expected Response (201 Created):**
```json
{
  "success": true
}
```

### Test 9: Get Feedback History

```bash
curl -X GET http://localhost:4000/admin/enrollment/00000000-0000-0000-0000-000000000002/feedback \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure"
```

**Expected Response (200 OK):**
```json
{
  "feedback": [
    {
      "id": "...",
      "enrollmentId": "00000000-0000-0000-0000-000000000002",
      "feedback": "Excellent progress! Keep up the good work.",
      "createdBy": "00000000-0000-0000-0000-000000000099",
      "createdAt": "2026-09-22T13:10:00.000Z",
      "updatedAt": "2026-09-22T13:10:00.000Z"
    }
  ]
}
```

## Error Testing

### Test 10: Try to Complete Already Completed Assessment

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002/complete \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "assessedBy": "00000000-0000-0000-0000-000000000099"
  }'
```

**Expected Response (409 Conflict):**
```json
{
  "error": "Assessment is already completed."
}
```

### Test 11: Try Invalid Admin Key

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002 \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: wrong_key" \
  -d '{}'
```

**Expected Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

### Test 12: Try Invalid Points Range

```bash
curl -X POST http://localhost:4000/admin/assessment/00000000-0000-0000-0000-000000000002 \
  -H "Content-Type: application/json" \
  -H "X-Admin-Api-Key: test_admin_key_for_local_development_only_not_secure" \
  -d '{
    "assessedBy": "00000000-0000-0000-0000-000000000099",
    "questionGrades": [
      {
        "questionId": "q1",
        "pointsEarned": 15,
        "pointsAvailable": 10
      }
    ]
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "error": "Points earned must be between 0 and 10 for question q1."
}
```

## Database Verification

Check the database state at any time:

```sql
-- View all assessments
SELECT * FROM assessments;

-- View grades for an assessment
SELECT * FROM assessment_question_grades 
WHERE assessment_id = 'your-assessment-id';

-- View all feedback
SELECT * FROM assessment_question_feedback;
SELECT * FROM assessment_feedback;
SELECT * FROM enrollment_feedback;

-- View enrollment status
SELECT id, progress_status, completed_at 
FROM enrollments 
WHERE student_id = '00000000-0000-0000-0000-000000000001';

-- View awarded points
SELECT * FROM points 
WHERE student_id = '00000000-0000-0000-0000-000000000001';
```

## Cleanup

To reset test data:

```sql
DELETE FROM assessments WHERE enrollment_id = '00000000-0000-0000-0000-000000000002';
DELETE FROM enrollments WHERE id = '00000000-0000-0000-0000-000000000002';
DELETE FROM students WHERE id = '00000000-0000-0000-0000-000000000001';
```

## Troubleshooting

### Database Connection Issues

**Error:** `DATABASE_URL is required`

**Solution:** Add valid Neon connection string to `.env`

### Contentful Issues

**Error:** `Content not found` or `Contentful is not configured`

**Solution:** Add Contentful credentials to `.env` or use a mock content ID that exists in your Contentful space

### Migration Issues

**Error:** Migration fails

**Solution:** 
1. Check database connection
2. Ensure you have permissions to create tables
3. Check if migrations were already applied: `SELECT * FROM schema_migrations;`

### Auth Issues

**Error:** `Unauthorized`

**Solution:** Ensure `X-Admin-Api-Key` header matches `ADMIN_API_KEY` in `.env`

## Success Criteria

✅ All 5 assessment tables created  
✅ Can save assessment (draft mode)  
✅ Can update assessment  
✅ Can retrieve assessment  
✅ Can complete assessment  
✅ Points are recorded in database  
✅ Enrollment status updates to 'assessed'  
✅ Can add general feedback  
✅ Can retrieve feedback history  
✅ Error handling works correctly  

## Next Steps

Once testing is complete:
1. Merge the PR
2. Deploy to staging/production
3. Run migrations on production database
4. Implement frontend using `docs/assessment-frontend-guide.md`
5. Test full workflow end-to-end
