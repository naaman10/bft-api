# Notification System - Quick Overview

This is a high-level summary of the notification system plan. For full details, see [notification-system-plan.md](./notification-system-plan.md).

## 🎯 Goal

Enable learners to receive in-app notifications about important events: new assignments, graded assessments, and points earned.

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TRIGGERS                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Admin Enrolls Student    Assessment Graded    Points Earned│
│         ↓                        ↓                   ↓       │
│  enrollStudentInContent   completeAssessment  saveProgress  │
│         ↓                        ↓                   ↓       │
│         └────────────────────────┴───────────────────┘       │
│                              ↓                               │
│                   createNotification()                       │
│                              ↓                               │
└──────────────────────────────┼───────────────────────────────┘
                               ↓
                  ┌────────────────────────┐
                  │   NOTIFICATIONS TABLE   │
                  ├────────────────────────┤
                  │ • id                   │
                  │ • student_id           │
                  │ • type                 │
                  │ • read / read_at       │
                  │ • title / message      │
                  │ • metadata (JSONB)     │
                  │ • enrollment_id        │
                  │ • content_id           │
                  │ • created_at           │
                  └────────────────────────┘
                               ↓
                  ┌────────────────────────┐
                  │      API ENDPOINTS      │
                  ├────────────────────────┤
                  │ GET /notifications     │
                  │ GET /unread-count      │
                  │ PATCH /:id/read        │
                  │ PATCH /read-all        │
                  └────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND UI                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   🔔 Bell Icon (with badge)   →   Dropdown Menu             │
│                                                              │
│   • Shows unread count            • Recent 5 notifications  │
│   • Click to open dropdown        • Click to mark as read   │
│   • Polls every 60s               • Link to full list       │
│                                                              │
│   Full Notification Page                                    │
│   • Paginated list                                          │
│   • Filter by unread                                        │
│   • Mark all as read                                        │
│   • Click to navigate to content                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Notification Types

| Type | Icon | Color | Trigger | Example Message |
|------|------|-------|---------|-----------------|
| **assignment** | 📚 | Blue | Admin enrolls student | "You have been assigned: Paper 1 Maths Mock Test" |
| **assessment** | ✅ | Green | Admin completes grading | "Your Math Quiz has been graded. You earned 15 points!" |
| **reward** | ⭐ | Gold | Points awarded (auto/manual) | "You earned 5 points for completing a question!" |
| **feedback** | 💬 | Purple | Admin adds feedback | "Your teacher left feedback on English Essay" |
| **status_change** | 🔄 | Gray | Progress status changes | "Your assessment is ready for grading" |
| **milestone** | 🏆 | Gold | Target reached | "Congratulations! You reached 100 points!" |

## 🗄️ Database Schema (Simplified)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id),
  type TEXT CHECK (type IN ('assignment', 'assessment', 'reward', ...)),
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  enrollment_id UUID REFERENCES enrollments(id),
  content_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key indexes for performance
CREATE INDEX ON notifications (student_id, read, created_at DESC);
CREATE INDEX ON notifications (student_id) WHERE read = FALSE;
```

## 🔌 API Usage Examples

### Get Notifications
```http
GET /learn/notifications?limit=20&offset=0&unread=false
Authorization: Bearer <jwt>

Response:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "assignment",
      "read": false,
      "title": "New Assignment",
      "message": "You have been assigned: Paper 1 Maths Mock Test",
      "metadata": {
        "contentName": "Paper 1 Maths Mock Test",
        "contentType": "Assessment"
      },
      "enrollmentId": "uuid",
      "contentId": "contentful-id",
      "createdAt": "2026-09-23T10:00:00.000Z"
    }
  ],
  "total": 45,
  "unread": 3
}
```

### Get Unread Count (Lightweight)
```http
GET /learn/notifications/unread-count
Authorization: Bearer <jwt>

Response: { "count": 3 }
```

### Mark as Read
```http
PATCH /learn/notifications/:id/read
Authorization: Bearer <jwt>

Response: { "success": true }
```

### Mark All as Read
```http
PATCH /learn/notifications/read-all
Authorization: Bearer <jwt>

Response: { "success": true, "count": 3 }
```

## 💻 Frontend Integration

### React Hook Example
```typescript
function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  
  useEffect(() => {
    // Initial fetch
    fetchUnreadCount();
    
    // Poll every 60 seconds
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);
  
  const fetchUnreadCount = async () => {
    const { count } = await api.get('/learn/notifications/unread-count');
    setUnreadCount(count);
  };
  
  return { unreadCount };
}
```

### Component Usage
```tsx
function NotificationBell() {
  const { unreadCount } = useNotifications();
  
  return (
    <button className="notification-bell">
      <BellIcon />
      {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
    </button>
  );
}
```

## ⚡ Quick Implementation Guide

### Phase 1: Database Setup
1. Create migration file `008_notifications.sql`
2. Run `npm run migrate`
3. Verify table and indexes created

### Phase 2: Backend Library
1. Create `src/lib/notifications.ts`
2. Implement core functions:
   - `createNotification()`
   - `getNotificationsForStudent()`
   - `markNotificationsAsRead()`
   - `getUnreadCount()`

### Phase 3: Add Triggers
1. Update `src/lib/enrollments.ts` → enrollment notifications
2. Update `src/lib/assessments.ts` → assessment notifications
3. Update `src/lib/enrollments.ts` → reward notifications

### Phase 4: API Endpoints
1. Add routes to `src/routes/learn.ts`
2. Test with JWT authentication
3. Update TypeScript types

### Phase 5: Frontend
1. Create notification components
2. Implement API client
3. Add polling mechanism
4. Style notification types
5. Add navigation links

## 🔒 Key Security Considerations

1. **Authorization**: Students can only see their own notifications
2. **Validation**: Verify notification ownership before marking as read
3. **SQL Injection**: Use parameterized queries (already using Neon)
4. **XSS**: Sanitize notification content if user-generated

## 📈 Performance Optimizations

1. **Indexes**: Composite index on `(student_id, read, created_at DESC)`
2. **Pagination**: Limit queries to 50 notifications at a time
3. **Cleanup**: Delete old read notifications after 90 days
4. **Caching**: Cache unread count in Redis (optional, if scaling issues)
5. **Polling**: 60s interval strikes balance between freshness and load

## 🚀 Future Enhancements

- **Real-time Updates**: WebSocket or Server-Sent Events (if instant delivery becomes important)
- **Email Notifications**: Individual email alerts for critical notifications (if requested)
- **Push Notifications**: Browser push API (if mobile web app is developed)
- **Preferences**: Per-type notification settings (if students request customization)
- **Admin Dashboard**: View notification analytics (engagement, read rates, etc.)

## 📊 Metrics to Track

- Notification creation rate by type
- Average time to read
- Read rate (engagement)
- Click-through rate to content
- Unread notification distribution

## ✅ Key Decisions Made

1. **Retention**: Keep read notifications for **60 days** (then auto-delete)
2. **Batching**: **Not needed** - show individual notifications for each point reward
3. **Critical vs Nice-to-have**: **Not needed** - all notifications treated equally
4. **Digest Mode**: **Not needed** - no email digest functionality
5. **Real-time**: **Start with polling** (60-second interval) - simpler implementation, adequate for educational context

## 📚 Related Documentation

- [Full Notification System Plan](./notification-system-plan.md) - Complete implementation details
- [Assessment System](./assessment-system.md) - Related to assessment notifications
- [README.md](../README.md) - API documentation

---

**Status**: Planning Complete ✅  
**Next Step**: Review plan and begin Phase 1 (database migration)
