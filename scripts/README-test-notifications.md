# Test Notifications Scripts

Scripts to help test the notification system.

## Option 1: SQL File (Recommended if DATABASE_URL not configured)

Run the SQL file directly against your database:

```bash
# Using psql
psql $DATABASE_URL -f scripts/test-notifications.sql

# Or in Neon console SQL editor
# Copy and paste the contents of scripts/test-notifications.sql
```

## Option 2: TypeScript Script (If DATABASE_URL is configured)

Make sure your `.env` file has `DATABASE_URL` set, then:

```bash
npm run tsx scripts/add-test-notifications.ts
```

## What Gets Created

Both scripts create **8 test notifications** for student ID `815d58f0-0a91-4ac2-86af-5ae178c0042e`:

| # | Type | Title | Status | Description |
|---|------|-------|--------|-------------|
| 1 | `assignment` | New Assignment | Unread | Introduction to Algebra |
| 2 | `assessment` | Assessment Graded | **Read** | English Essay - 85 points |
| 3 | `reward` | Points Earned! | Unread | 10 points from Maths Quiz |
| 4 | `reward` | Points Earned! | Unread | 5 points from Science Test |
| 5 | `feedback` | New Feedback | Unread | Teacher feedback on History |
| 6 | `status_change` | Assessment Ready | Unread | Physics Lab Report |
| 7 | `milestone` | Milestone Reached! | Unread | 100 points achieved |
| 8 | `assignment` | New Assignment | **Read** | Shakespeare Analysis (2 days old) |

**Result:** 6 unread, 2 read notifications

## Testing the API

After running the script, test with:

```bash
# Get unread count (should return 6)
curl -H "Authorization: Bearer <jwt-for-student>" \
  http://localhost:4000/learn/notifications/unread-count

# Get all notifications
curl -H "Authorization: Bearer <jwt-for-student>" \
  http://localhost:4000/learn/notifications?limit=10

# Get only unread notifications
curl -H "Authorization: Bearer <jwt-for-student>" \
  http://localhost:4000/learn/notifications?unread=true

# Mark one as read
curl -X PATCH \
  -H "Authorization: Bearer <jwt-for-student>" \
  http://localhost:4000/learn/notifications/<notification-id>/read

# Mark all as read
curl -X PATCH \
  -H "Authorization: Bearer <jwt-for-student>" \
  http://localhost:4000/learn/notifications/read-all
```

## Clean Up Test Data

To remove test notifications:

```sql
DELETE FROM notifications 
WHERE student_id = '815d58f0-0a91-4ac2-86af-5ae178c0042e'::uuid;
```

## Student ID

The test student ID used is: `815d58f0-0a91-4ac2-86af-5ae178c0042e`

Make sure this student exists in your `students` table before running the scripts.
