# Notification System Plan

## Overview

This document outlines a comprehensive notification system for learners to receive real-time updates about enrollments, assessments, and point rewards.

## Current System Context

- **Backend**: Node.js/TypeScript with Hono framework
- **Database**: PostgreSQL (Neon) with migrations
- **Authentication**: Neon Auth with JWT
- **Frontend**: Separate application (likely React-based, communicates via REST API)
- **Current architecture**: Students linked to `neon_user_id`, with enrollments, assessments, and points tracking

## Notification Requirements

### Core Notification Types

1. **Enrollment Notifications** (`assignment`)
   - Triggered when: Admin enrolls a student in new content via `POST /admin/enroll/:studentId`
   - Contains: Content name, content type, enrollment date

2. **Assessment Notifications** (`assessment`)
   - Triggered when: Admin completes grading via `POST /admin/assessment/:enrollmentId/complete`
   - Contains: Assessment name, points earned, feedback available flag

3. **Points Reward Notifications** (`reward`)
   - Triggered when: 
     - Automatic marking awards points on completion
     - Manual assessment awards points
   - Contains: Points earned, content name, question details (optional)

### Additional Notification Types to Consider

4. **Feedback Notifications** (`feedback`)
   - Triggered when: Admin adds feedback via `POST /admin/enrollment/:enrollmentId/feedback`
   - Contains: Enrollment name, feedback preview

5. **Enrollment Status Changes** (`status_change`)
   - Triggered when: Progress status changes (e.g., `to_assess` → `assessed`)
   - Contains: Old status, new status, content name

6. **Achievement Milestones** (`milestone`)
   - Triggered when: Student reaches point targets or completes significant progress
   - Contains: Milestone description, total points, target progress

## Database Schema

### Main Notifications Table

```sql
-- migrations/008_notifications.sql
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS notifications_student_id_idx 
  ON notifications (student_id);

CREATE INDEX IF NOT EXISTS notifications_student_unread_idx 
  ON notifications (student_id, read) 
  WHERE read = FALSE;

CREATE INDEX IF NOT EXISTS notifications_type_idx 
  ON notifications (type);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx 
  ON notifications (created_at DESC);

-- Composite index for common query pattern (student's recent unread notifications)
CREATE INDEX IF NOT EXISTS notifications_student_read_created_idx 
  ON notifications (student_id, read, created_at DESC);
```

### Metadata Structure Examples

The `metadata` JSONB field allows flexible, type-specific data:

```typescript
// For 'assignment' notifications
{
  contentName: string;
  contentType: string; // "Homework", "Lesson", "Assessment"
  subject: string;
  ageGroup: string;
}

// For 'assessment' notifications
{
  contentName: string;
  pointsEarned: number;
  pointsAvailable: number;
  hasFeedback: boolean;
  assessedBy: string; // admin user ID
}

// For 'reward' notifications
{
  contentName: string;
  pointsEarned: number;
  pointsAvailable: number;
  questionId?: string;
  source: 'automatic' | 'assessment';
}

// For 'feedback' notifications
{
  contentName: string;
  feedbackPreview: string; // First 100 chars
  feedbackId: string;
}

// For 'status_change' notifications
{
  contentName: string;
  oldStatus: string;
  newStatus: string;
}

// For 'milestone' notifications
{
  milestoneType: 'points_target' | 'completion_count' | 'streak';
  milestoneValue: number;
  totalPoints?: number;
  targetPoints?: number;
}
```

## Backend Implementation

### 1. Notification Library (`src/lib/notifications.ts`)

```typescript
import { getDb } from "./db.js";
import { getStudentById } from "./students.js";

export type NotificationType = 
  | 'assignment'
  | 'assessment'
  | 'reward'
  | 'feedback'
  | 'status_change'
  | 'milestone';

export interface CreateNotificationInput {
  studentId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  enrollmentId?: string;
  assessmentId?: string;
  contentId?: string;
}

export interface Notification {
  id: string;
  studentId: string;
  type: NotificationType;
  read: boolean;
  readAt: string | null;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  enrollmentId: string | null;
  assessmentId: string | null;
  contentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create a new notification for a student
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification> {
  const sql = getDb();
  
  const rows = await sql`
    INSERT INTO notifications (
      student_id,
      type,
      title,
      message,
      metadata,
      enrollment_id,
      assessment_id,
      content_id
    ) VALUES (
      ${input.studentId}::uuid,
      ${input.type},
      ${input.title},
      ${input.message},
      ${JSON.stringify(input.metadata || {})}::jsonb,
      ${input.enrollmentId || null}::uuid,
      ${input.assessmentId || null}::uuid,
      ${input.contentId || null}
    )
    RETURNING 
      id, student_id, type, read, read_at,
      title, message, metadata,
      enrollment_id, assessment_id, content_id,
      created_at, updated_at
  `;
  
  return mapNotificationRow(rows[0]);
}

/**
 * Get notifications for a student (by Neon user ID)
 * Supports pagination and filtering by read status
 */
export async function getNotificationsForStudent(
  studentId: string,
  options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ notifications: Notification[]; total: number; unread: number }> {
  const sql = getDb();
  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  
  const whereClause = options?.unreadOnly 
    ? sql`AND read = FALSE` 
    : sql``;
  
  const [notifications, counts] = await Promise.all([
    sql`
      SELECT 
        id, student_id, type, read, read_at,
        title, message, metadata,
        enrollment_id, assessment_id, content_id,
        created_at, updated_at
      FROM notifications
      WHERE student_id = ${studentId}::uuid ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
    sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE read = FALSE) as unread
      FROM notifications
      WHERE student_id = ${studentId}::uuid
    `
  ]);
  
  return {
    notifications: notifications.map(mapNotificationRow),
    total: Number(counts[0].total),
    unread: Number(counts[0].unread),
  };
}

/**
 * Mark notification(s) as read
 */
export async function markNotificationsAsRead(
  notificationIds: string[]
): Promise<number> {
  if (notificationIds.length === 0) return 0;
  
  const sql = getDb();
  const rows = await sql`
    UPDATE notifications
    SET 
      read = TRUE,
      read_at = NOW(),
      updated_at = NOW()
    WHERE id = ANY(${notificationIds}::uuid[])
      AND read = FALSE
    RETURNING id
  `;
  
  return rows.length;
}

/**
 * Mark all notifications as read for a student
 */
export async function markAllNotificationsAsRead(
  studentId: string
): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE notifications
    SET 
      read = TRUE,
      read_at = NOW(),
      updated_at = NOW()
    WHERE student_id = ${studentId}::uuid
      AND read = FALSE
    RETURNING id
  `;
  
  return rows.length;
}

/**
 * Delete old read notifications (cleanup job)
 * Keeps unread notifications and recent read notifications (within retentionDays)
 */
export async function deleteOldNotifications(
  retentionDays: number = 90
): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM notifications
    WHERE read = TRUE
      AND read_at < NOW() - INTERVAL '${retentionDays} days'
    RETURNING id
  `;
  
  return rows.length;
}

/**
 * Get unread notification count for a student
 */
export async function getUnreadCount(studentId: string): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*) as count
    FROM notifications
    WHERE student_id = ${studentId}::uuid
      AND read = FALSE
  `;
  
  return Number(rows[0].count);
}

function mapNotificationRow(row: any): Notification {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    type: row.type as NotificationType,
    read: Boolean(row.read),
    readAt: row.read_at ? 
      (row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at) : 
      null,
    title: String(row.title),
    message: String(row.message),
    metadata: typeof row.metadata === 'string' 
      ? JSON.parse(row.metadata) 
      : row.metadata || {},
    enrollmentId: row.enrollment_id ? String(row.enrollment_id) : null,
    assessmentId: row.assessment_id ? String(row.assessment_id) : null,
    contentId: row.content_id ? String(row.content_id) : null,
    createdAt: row.created_at instanceof Date 
      ? row.created_at.toISOString() 
      : row.created_at,
    updatedAt: row.updated_at instanceof Date 
      ? row.updated_at.toISOString() 
      : row.updated_at,
  };
}
```

### 2. Notification Triggers

Integrate notification creation into existing endpoints:

#### A. Enrollment Notifications (in `src/lib/enrollments.ts`)

```typescript
// Add to enrollStudentInContent function after successful enrollment
import { createNotification } from './notifications.js';
import { getContentNamesByIds } from './content.js';

// After enrollments are created:
for (const enrollment of enrollments) {
  try {
    const names = await getContentNamesByIds([enrollment.contentId]);
    const contentName = names.get(enrollment.contentId) || 'New Content';
    
    await createNotification({
      studentId: enrollment.studentId,
      type: 'assignment',
      title: 'New Assignment',
      message: `You have been assigned: ${contentName}`,
      metadata: {
        contentName,
        // Could include more from Contentful
      },
      enrollmentId: enrollment.id,
      contentId: enrollment.contentId,
    });
  } catch (error) {
    console.error('Failed to create enrollment notification:', error);
    // Don't fail the enrollment if notification fails
  }
}
```

#### B. Assessment Completion Notifications (in `src/lib/assessments.ts`)

```typescript
// After assessment is completed and points are awarded:
await createNotification({
  studentId: enrollment.studentId,
  type: 'assessment',
  title: 'Assessment Graded',
  message: `Your ${contentName} has been graded. You earned ${totalPoints} points!`,
  metadata: {
    contentName,
    pointsEarned: totalPoints,
    pointsAvailable: totalAvailable,
    hasFeedback: Boolean(overallFeedback || questionFeedback.length),
    assessedBy: assessedBy,
  },
  enrollmentId: enrollment.id,
  assessmentId: assessment.id,
  contentId: enrollment.contentId,
});
```

#### C. Points Reward Notifications (in `src/lib/enrollments.ts`)

```typescript
// In saveLearnProgress function, after points are awarded:
if (pointAwards.length > 0) {
  for (const award of pointAwards) {
    try {
      await createNotification({
        studentId: student.id,
        type: 'reward',
        title: 'Points Earned!',
        message: `You earned ${award.pointsEarned} points for completing a question!`,
        metadata: {
          contentName: markingScheme.contentName,
          pointsEarned: award.pointsEarned,
          pointsAvailable: award.pointsAvailable,
          questionId: award.questionId,
          source: 'automatic',
        },
        enrollmentId: row.id,
        contentId: contentId,
      });
    } catch (error) {
      console.error('Failed to create points notification:', error);
    }
  }
}
```

### 3. API Endpoints (`src/routes/learn.ts`)

```typescript
// GET /learn/notifications
// List notifications for authenticated student
learnRoutes.get("/notifications", requireAuth, async (c) => {
  const user = c.get("user");
  
  // Get student from neon user ID
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  const unreadOnly = c.req.query("unread") === "true";
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  
  const result = await getNotificationsForStudent(student.id, {
    unreadOnly,
    limit,
    offset,
  });
  
  return c.json(result);
});

// GET /learn/notifications/unread-count
// Get just the count of unread notifications (lightweight for polling)
learnRoutes.get("/notifications/unread-count", requireAuth, async (c) => {
  const user = c.get("user");
  
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ count: 0 });
  }
  
  const count = await getUnreadCount(student.id);
  
  return c.json({ count });
});

// PATCH /learn/notifications/:id/read
// Mark a single notification as read
learnRoutes.patch("/notifications/:id/read", requireAuth, async (c) => {
  const user = c.get("user");
  const notificationId = c.req.param("id");
  
  // Verify the notification belongs to this student
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  await markNotificationsAsRead([notificationId]);
  
  return c.json({ success: true });
});

// PATCH /learn/notifications/read-all
// Mark all notifications as read for the authenticated student
learnRoutes.patch("/notifications/read-all", requireAuth, async (c) => {
  const user = c.get("user");
  
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  const count = await markAllNotificationsAsRead(student.id);
  
  return c.json({ success: true, count });
});
```

### 4. Updated Session Response

Update `/learn/user` to include unread notification count:

```typescript
// In src/routes/learn.ts
learnRoutes.get("/user", requireAuth, async (c) => {
  const user = c.get("user");
  
  const student = await getStudentByNeonUserId(user.id);
  const unreadNotificationCount = student 
    ? await getUnreadCount(student.id) 
    : 0;
  
  // ... existing code ...
  
  const body: SessionResponse = {
    authenticated: true,
    user,
    enrollments,
    totalPoints,
    targetPoints,
    completedAssessments,
    unreadNotificationCount, // Add this
  };
  
  return c.json(body);
});
```

## Frontend Implementation Considerations

### 1. Notification Component Structure

```
components/
  Notifications/
    NotificationBell.tsx          # Bell icon with unread badge
    NotificationDropdown.tsx      # Dropdown menu with recent notifications
    NotificationList.tsx          # Full page notification list
    NotificationItem.tsx          # Individual notification display
    NotificationIcon.tsx          # Type-specific icons
```

### 2. State Management

- **Polling**: Simple approach - poll `/learn/notifications/unread-count` every 30-60 seconds
- **WebSocket/SSE**: For real-time updates (future enhancement)
- **Local state**: Track notifications in React state or global state (Redux/Zustand)

### 3. UI/UX Patterns

#### Notification Bell
- Shows unread count badge
- Click to open dropdown with recent 5 notifications
- "View All" link to full notification page

#### Notification Dropdown
- Recent 5-10 notifications
- Click notification to mark as read and navigate to relevant page
- "Mark all as read" button

#### Notification Types Visual Design
- **Assignment**: 📚 Blue - Book/document icon
- **Assessment**: ✅ Green - Checkmark icon  
- **Reward**: ⭐ Gold - Star/trophy icon
- **Feedback**: 💬 Purple - Speech bubble icon
- **Status Change**: 🔄 Gray - Refresh icon
- **Milestone**: 🏆 Gold - Trophy icon

### 4. Navigation from Notifications

Each notification should link to relevant content:
- **Assignment**: Link to enrollment/content detail page
- **Assessment**: Link to graded assessment results
- **Reward**: Link to points/achievements page
- **Feedback**: Link to enrollment with feedback visible

### 5. API Integration Example

```typescript
// services/notifications.ts
export interface NotificationAPI {
  getNotifications(options?: {
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationListResponse>;
  
  getUnreadCount(): Promise<{ count: number }>;
  
  markAsRead(notificationId: string): Promise<void>;
  
  markAllAsRead(): Promise<{ count: number }>;
}

// React hook example
export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const result = await notificationAPI.getNotifications();
      setNotifications(result.notifications);
      setUnreadCount(result.unread);
    } finally {
      setLoading(false);
    }
  };
  
  const markAsRead = async (id: string) => {
    await notificationAPI.markAsRead(id);
    // Optimistically update local state
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };
  
  useEffect(() => {
    fetchNotifications();
    // Poll for updates every 60 seconds
    const interval = setInterval(() => {
      notificationAPI.getUnreadCount().then(({ count }) => {
        if (count !== unreadCount) {
          fetchNotifications();
        }
      });
    }, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  return { notifications, unreadCount, loading, markAsRead, refresh: fetchNotifications };
}
```

## Additional Features & Considerations

### 1. Notification Preferences (Future Enhancement)

Add a `notification_preferences` table:

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  
  -- Per-type preferences
  assignment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  assessment_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reward_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  feedback_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status_change_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  milestone_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Delivery preferences (future)
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_frequency TEXT DEFAULT 'immediate' 
    CHECK (email_frequency IN ('immediate', 'daily_digest', 'weekly_digest', 'never')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2. Email Notifications (Future Enhancement)

- Use existing Resend integration
- Send email for critical notifications (assessment graded, new assignment)
- Respect user email preferences
- Daily/weekly digest options

### 3. Push Notifications (Future Enhancement)

- Web Push API for browser notifications
- Requires service worker setup
- Store push subscriptions in database

### 4. Real-time Updates

Two approaches:

#### Option A: Server-Sent Events (SSE)
```typescript
// src/routes/learn.ts
learnRoutes.get("/notifications/stream", requireAuth, async (c) => {
  // Establish SSE connection
  // Stream new notifications as they're created
});
```

#### Option B: WebSocket
- More complex but bidirectional
- Requires WebSocket server setup (e.g., Socket.io)
- Better for chat/real-time features

### 5. Notification Batching & Grouping

For better UX, consider:
- Batch multiple reward notifications: "You earned 15 points in Math Quiz" instead of 5 separate notifications
- Group related notifications: "3 new assignments this week"
- Implement in the `createNotification` function with deduplication logic

### 6. Analytics & Monitoring

Track notification metrics:
- Creation rate by type
- Read rate (engagement)
- Time to read
- Click-through rate to content

```sql
-- Add tracking fields (optional)
ALTER TABLE notifications ADD COLUMN clicked BOOLEAN DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN clicked_at TIMESTAMPTZ;
```

### 7. Admin Visibility

Add admin endpoint to see notification status:
- How many notifications sent per student
- Unread notification counts across all students
- Notification effectiveness metrics

### 8. Performance Optimization

- **Indexes**: Already included in schema for common queries
- **Caching**: Cache unread counts in Redis (if needed)
- **Pagination**: Implemented in API with limit/offset
- **Archival**: Cleanup job to delete old read notifications (90+ days)

### 9. Testing Strategy

- **Unit tests**: Test notification creation logic
- **Integration tests**: Test API endpoints
- **E2E tests**: Test frontend notification flow
- **Load tests**: Ensure notification queries scale

### 10. Migration Path

1. **Phase 1**: Database migration + basic notification library
2. **Phase 2**: Integrate notifications into enrollment/assessment flows
3. **Phase 3**: Add API endpoints
4. **Phase 4**: Frontend notification bell & dropdown
5. **Phase 5**: Full notification center page
6. **Phase 6**: Real-time updates (SSE/WebSocket)
7. **Phase 7**: Email notifications & preferences

## Security Considerations

1. **Authorization**: Ensure students can only access their own notifications
2. **Validation**: Validate all notification IDs against student ownership
3. **Rate limiting**: Prevent spam by limiting notification creation
4. **XSS Protection**: Sanitize notification content if it includes user input
5. **SQL Injection**: Use parameterized queries (already done with `neon/serverless`)

## Summary Checklist

### Database
- [ ] Create `notifications` table migration
- [ ] Add indexes for performance
- [ ] Run migration on all environments

### Backend
- [ ] Implement `src/lib/notifications.ts` library
- [ ] Add notification triggers to enrollment flow
- [ ] Add notification triggers to assessment flow
- [ ] Add notification triggers to points flow
- [ ] Create API endpoints for notifications
- [ ] Update `/learn/user` to include unread count
- [ ] Add error handling and logging

### Frontend
- [ ] Create notification API client
- [ ] Implement notification bell component
- [ ] Implement notification dropdown
- [ ] Implement full notification list page
- [ ] Add polling for unread count
- [ ] Add navigation from notifications
- [ ] Style notification types differently
- [ ] Add loading and error states

### Testing
- [ ] Unit tests for notification library
- [ ] Integration tests for API endpoints
- [ ] E2E tests for frontend flows
- [ ] Manual testing across all notification types

### Documentation
- [ ] Update API documentation
- [ ] Frontend integration guide
- [ ] User-facing documentation (if needed)

### Optional/Future
- [ ] Notification preferences
- [ ] Email notifications
- [ ] Push notifications
- [ ] Real-time updates (SSE/WebSocket)
- [ ] Admin analytics dashboard
- [ ] Notification batching/grouping

## Questions to Consider

1. **Notification Retention**: How long should read notifications be kept? (Suggested: 90 days)

2. **Batch Notifications**: Should multiple similar notifications be grouped? (e.g., "You earned 15 points" vs 3 separate 5-point notifications)

3. **Critical vs Non-Critical**: Should some notifications be more prominent? (Assessment grading = critical, milestone = nice-to-have)

4. **Notification Sounds**: Should the frontend play a sound for new notifications?

5. **Mobile Experience**: Will this be used on mobile? Consider mobile-specific UX patterns.

6. **Offline Support**: Should notifications be cached for offline viewing?

7. **Localization**: Will notifications need to support multiple languages?

8. **Admin Notifications**: Should admins receive notifications too? (e.g., "Student completed assignment")

9. **Digest Mode**: Should students receive a daily/weekly email digest of notifications instead of individual notifications?

10. **Undo Actions**: Should students be able to dismiss/delete notifications permanently?
