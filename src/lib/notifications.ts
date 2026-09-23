import { getDb } from "./db.js";

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

type NotificationRow = {
  id: string;
  student_id: string;
  type: NotificationType;
  read: boolean;
  read_at: string | Date | null;
  title: string;
  message: string;
  metadata: unknown;
  enrollment_id: string | null;
  assessment_id: string | null;
  content_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: String(row.id),
    studentId: String(row.student_id),
    type: row.type,
    read: Boolean(row.read),
    readAt: toIso(row.read_at),
    title: String(row.title),
    message: String(row.message),
    metadata: typeof row.metadata === 'string' 
      ? JSON.parse(row.metadata) 
      : (row.metadata as Record<string, unknown>) || {},
    enrollmentId: row.enrollment_id ? String(row.enrollment_id) : null,
    assessmentId: row.assessment_id ? String(row.assessment_id) : null,
    contentId: row.content_id ? String(row.content_id) : null,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
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
  
  return mapNotificationRow(rows[0] as NotificationRow);
}

/**
 * Get notifications for a student
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
  
  const countRow = counts[0];
  
  return {
    notifications: notifications.map(row => mapNotificationRow(row as NotificationRow)),
    total: countRow ? Number(countRow.total) : 0,
    unread: countRow ? Number(countRow.unread) : 0,
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
  
  const row = rows[0];
  return row ? Number(row.count) : 0;
}

/**
 * Delete old read notifications (cleanup job)
 * Keeps unread notifications and recent read notifications (within 60 days)
 * This should be run as a periodic job (e.g., daily cron)
 */
export async function deleteOldNotifications(
  retentionDays: number = 60
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
