# Frontend Notification Implementation Guide (Phase 5)

This guide provides everything needed to implement the notification UI in your frontend application.

## 🎯 Overview

The backend is complete with 4 REST endpoints. Your frontend needs to:
1. Poll for unread count every 60 seconds
2. Display notification bell with badge
3. Show notification dropdown/list
4. Mark notifications as read when clicked

## 📡 API Endpoints Reference

### 1. Get Unread Count (Lightweight - for polling)

```http
GET /learn/notifications/unread-count
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "count": 3
}
```

**Use:** Poll this every 60 seconds to update the badge count.

---

### 2. Get Notifications List (Paginated)

```http
GET /learn/notifications?limit=20&offset=0&unread=true
Authorization: Bearer <jwt>
```

**Query Parameters:**
- `limit` (optional, default 50) - Number of notifications to return
- `offset` (optional, default 0) - Skip N notifications (for pagination)
- `unread` (optional, "true" or "false") - Filter by read status

**Response:**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "studentId": "uuid",
      "type": "assignment",
      "read": false,
      "readAt": null,
      "title": "New Assignment",
      "message": "You have been assigned: Paper 1 Maths Mock Test",
      "metadata": {
        "contentName": "Paper 1 Maths Mock Test"
      },
      "enrollmentId": "uuid",
      "assessmentId": null,
      "contentId": "contentful-id",
      "createdAt": "2026-09-23T10:00:00.000Z",
      "updatedAt": "2026-09-23T10:00:00.000Z"
    }
  ],
  "total": 45,
  "unread": 3
}
```

**Use:** Display full notification list page or dropdown.

---

### 3. Mark Single Notification as Read

```http
PATCH /learn/notifications/:id/read
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true
}
```

**Use:** When user clicks a notification.

---

### 4. Mark All as Read

```http
PATCH /learn/notifications/read-all
Authorization: Bearer <jwt>
```

**Response:**
```json
{
  "success": true,
  "count": 5
}
```

**Use:** "Mark all as read" button.

---

### 5. User Session (includes unread count)

```http
GET /learn/user
Authorization: Bearer <jwt>
```

**Response (updated):**
```json
{
  "authenticated": true,
  "user": { ... },
  "enrollments": [...],
  "totalPoints": 150,
  "targetPoints": 500,
  "completedAssessments": [...],
  "unreadNotificationCount": 3  // NEW FIELD
}
```

**Use:** Initial load to get unread count without extra request.

## 🛠️ React Implementation Examples

### 1. API Client

```typescript
// services/notifications.ts

export interface Notification {
  id: string;
  studentId: string;
  type: 'assignment' | 'assessment' | 'reward' | 'feedback' | 'status_change' | 'milestone';
  read: boolean;
  readAt: string | null;
  title: string;
  message: string;
  metadata: Record<string, any>;
  enrollmentId: string | null;
  assessmentId: string | null;
  contentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread: number;
}

class NotificationAPI {
  private baseUrl = '/learn/notifications';
  
  async getUnreadCount(): Promise<{ count: number }> {
    const response = await fetch(`${this.baseUrl}/unread-count`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    return response.json();
  }
  
  async getNotifications(options?: {
    unread?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<NotificationListResponse> {
    const params = new URLSearchParams();
    if (options?.unread !== undefined) params.set('unread', String(options.unread));
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    
    const response = await fetch(`${this.baseUrl}?${params}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    return response.json();
  }
  
  async markAsRead(notificationId: string): Promise<void> {
    await fetch(`${this.baseUrl}/${notificationId}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
  }
  
  async markAllAsRead(): Promise<{ count: number }> {
    const response = await fetch(`${this.baseUrl}/read-all`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    return response.json();
  }
}

export const notificationAPI = new NotificationAPI();

// Helper to get auth token (adjust to your auth system)
function getToken(): string {
  // Return your JWT token from storage/context
  return localStorage.getItem('authToken') || '';
}
```

---

### 2. Notification Hook (with Polling)

```typescript
// hooks/useNotifications.ts
import { useState, useEffect, useCallback } from 'react';
import { notificationAPI, type Notification } from '../services/notifications';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  // Fetch full notification list
  const fetchNotifications = useCallback(async (options?: {
    unread?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    setLoading(true);
    try {
      const result = await notificationAPI.getNotifications(options);
      setNotifications(result.notifications);
      setUnreadCount(result.unread);
      setTotal(result.total);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch just unread count (lightweight)
  const fetchUnreadCount = useCallback(async () => {
    try {
      const { count } = await notificationAPI.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);
  
  // Mark single notification as read
  const markAsRead = useCallback(async (id: string) => {
    try {
      await notificationAPI.markAsRead(id);
      
      // Optimistically update local state
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);
  
  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      const { count } = await notificationAPI.markAllAsRead();
      
      // Optimistically update local state
      setNotifications(prev => 
        prev.map(n => ({ ...n, read: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, []);
  
  // Initial fetch on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);
  
  // Poll every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUnreadCount();
    }, 60000); // 60 seconds
    
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);
  
  return {
    notifications,
    unreadCount,
    total,
    loading,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications,
  };
}
```

---

### 3. Notification Bell Component

```tsx
// components/NotificationBell.tsx
import { useNotifications } from '../hooks/useNotifications';
import { BellIcon } from './icons'; // Your icon component

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900"
        aria-label="Notifications"
      >
        <BellIcon className="w-6 h-6" />
        
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <NotificationDropdown onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
}
```

---

### 4. Notification Dropdown

```tsx
// components/NotificationDropdown.tsx
import { useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import { Link } from 'react-router-dom'; // Or your router

interface Props {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: Props) {
  const { notifications, loading, fetchNotifications, markAsRead } = useNotifications();
  
  useEffect(() => {
    // Fetch recent notifications when dropdown opens
    fetchNotifications({ limit: 5 });
  }, [fetchNotifications]);
  
  const handleNotificationClick = async (id: string) => {
    await markAsRead(id);
    onClose();
    // Navigate to relevant page (implement based on notification type)
  };
  
  return (
    <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Notifications</h3>
      </div>
      
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No notifications</div>
        ) : (
          notifications.map(notification => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onClick={() => handleNotificationClick(notification.id)}
            />
          ))
        )}
      </div>
      
      <div className="p-3 border-t border-gray-200 text-center">
        <Link
          to="/notifications"
          onClick={onClose}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          View All Notifications
        </Link>
      </div>
    </div>
  );
}
```

---

### 5. Notification Item Component

```tsx
// components/NotificationItem.tsx
import { formatDistanceToNow } from 'date-fns';
import { getNotificationIcon, getNotificationColor } from '../utils/notifications';

interface Props {
  notification: Notification;
  onClick: () => void;
}

export function NotificationItem({ notification, onClick }: Props) {
  const Icon = getNotificationIcon(notification.type);
  const color = getNotificationColor(notification.type);
  
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 ${
        !notification.read ? 'bg-blue-50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm ${!notification.read ? 'font-semibold' : 'font-medium'}`}>
              {notification.title}
            </p>
            {!notification.read && (
              <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
            {notification.message}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
          </p>
        </div>
      </div>
    </button>
  );
}
```

---

### 6. Notification Utility Functions

```typescript
// utils/notifications.ts
import { 
  BookOpenIcon, 
  CheckCircleIcon, 
  StarIcon, 
  ChatBubbleLeftIcon,
  ArrowPathIcon,
  TrophyIcon 
} from '@heroicons/react/24/outline'; // Or your icon library

export function getNotificationIcon(type: string) {
  switch (type) {
    case 'assignment':
      return BookOpenIcon;
    case 'assessment':
      return CheckCircleIcon;
    case 'reward':
      return StarIcon;
    case 'feedback':
      return ChatBubbleLeftIcon;
    case 'status_change':
      return ArrowPathIcon;
    case 'milestone':
      return TrophyIcon;
    default:
      return BookOpenIcon;
  }
}

export function getNotificationColor(type: string): string {
  switch (type) {
    case 'assignment':
      return 'bg-blue-500';
    case 'assessment':
      return 'bg-green-500';
    case 'reward':
      return 'bg-yellow-500';
    case 'feedback':
      return 'bg-purple-500';
    case 'status_change':
      return 'bg-gray-500';
    case 'milestone':
      return 'bg-yellow-600';
    default:
      return 'bg-blue-500';
  }
}

export function getNotificationLink(notification: Notification): string {
  // Navigate to relevant page based on notification type
  switch (notification.type) {
    case 'assignment':
      return `/content/${notification.contentId}`;
    case 'assessment':
      return `/assessments/${notification.assessmentId}`;
    case 'reward':
      return `/progress`;
    case 'feedback':
      return `/enrollments/${notification.enrollmentId}`;
    default:
      return '/dashboard';
  }
}
```

---

### 7. Full Notification List Page

```tsx
// pages/NotificationsPage.tsx
import { useState, useEffect } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationItem } from '../components/NotificationItem';
import { useNavigate } from 'react-router-dom';
import { getNotificationLink } from '../utils/notifications';

export function NotificationsPage() {
  const navigate = useNavigate();
  const { 
    notifications, 
    unreadCount, 
    total, 
    loading, 
    fetchNotifications, 
    markAsRead,
    markAllAsRead 
  } = useNotifications();
  
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 20;
  
  useEffect(() => {
    fetchNotifications({
      unread: filter === 'unread' ? true : undefined,
      limit: pageSize,
      offset: page * pageSize,
    });
  }, [filter, page, fetchNotifications]);
  
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }
    navigate(getNotificationLink(notification));
  };
  
  const totalPages = Math.ceil(total / pageSize);
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Notifications</h1>
        
        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg ${
                filter === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-lg ${
                filter === 'unread' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
          
          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800"
            >
              Mark all as read
            </button>
          )}
        </div>
      </div>
      
      {/* List */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </div>
        ) : (
          <div>
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
        )}
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 🎨 Styling Recommendations

### Tailwind CSS (Recommended)

The examples above use Tailwind. Key classes:

**Unread indicator:**
```tsx
className={!notification.read ? 'bg-blue-50' : ''}
```

**Badge colors by type:**
```tsx
const colors = {
  assignment: 'bg-blue-500',
  assessment: 'bg-green-500',
  reward: 'bg-yellow-500',
  feedback: 'bg-purple-500',
  status_change: 'bg-gray-500',
  milestone: 'bg-yellow-600',
};
```

### Custom CSS

If not using Tailwind, create classes for:
- `.notification-unread` - Light blue background
- `.notification-badge` - Red circle with white text
- `.notification-icon-{type}` - Colored backgrounds per type

---

## 📱 Mobile Responsiveness

### Dropdown → Full-screen on Mobile

```tsx
// components/NotificationDropdown.tsx
export function NotificationDropdown({ onClose }: Props) {
  return (
    <>
      {/* Desktop: Dropdown */}
      <div className="hidden md:block absolute right-0 mt-2 w-80 ...">
        {/* Dropdown content */}
      </div>
      
      {/* Mobile: Full-screen modal */}
      <div className="md:hidden fixed inset-0 bg-white z-50 overflow-y-auto">
        <div className="p-4">
          <button onClick={onClose} className="mb-4">
            ← Back
          </button>
          {/* Notification list */}
        </div>
      </div>
    </>
  );
}
```

---

## ✅ Testing Checklist

### Manual Testing
- [ ] Bell icon shows unread count on page load
- [ ] Badge updates when polling detects new notifications
- [ ] Clicking bell opens dropdown
- [ ] Dropdown shows recent 5 notifications
- [ ] Clicking notification marks it as read
- [ ] Unread notifications have visual indicator
- [ ] "View All" navigates to full page
- [ ] Full page shows paginated list
- [ ] Filter by "All" / "Unread" works
- [ ] "Mark all as read" updates UI instantly
- [ ] Pagination works correctly
- [ ] Mobile: Dropdown becomes full-screen

### Integration Testing
Create a test student and:
1. Enroll them → Check assignment notification appears
2. Complete content → Check reward notifications appear
3. Grade assessment → Check assessment notification appears
4. Add feedback → Check feedback notification appears

---

## 🚀 Deployment

1. **Backend deployed** ✅ (already done)
2. **Frontend build** - Build your React app with new components
3. **Test** - Verify all notification flows work
4. **Deploy** - Ship to production

---

## 📊 Analytics (Optional)

Track notification engagement:

```typescript
// When notification is clicked
trackEvent('notification_clicked', {
  notification_id: notification.id,
  notification_type: notification.type,
  time_to_click: Date.now() - new Date(notification.createdAt).getTime(),
});

// When notifications are marked as read
trackEvent('notifications_marked_read', {
  count: notifications.length,
  method: 'single' | 'all',
});
```

---

## 🐛 Troubleshooting

### Badge doesn't update
- Check polling interval is set (60s)
- Verify `/learn/notifications/unread-count` endpoint works
- Check browser console for errors

### Notifications don't appear
- Verify backend triggers are firing (check server logs)
- Test endpoints directly with curl/Postman
- Check JWT token is valid

### Infinite loading
- Verify API response structure matches types
- Check error handling in fetch functions
- Ensure loading state is set to false on errors

---

## 📚 Additional Resources

- [Backend API Documentation](../README.md#notifications)
- [Notification System Plan](./notification-system-plan.md)
- [date-fns Documentation](https://date-fns.org/) - For time formatting
- [Heroicons](https://heroicons.com/) - Icon library used in examples

---

**Questions?** Check the [main notification plan document](./notification-system-plan.md) or raise an issue on the PR.
