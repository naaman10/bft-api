import { progressPatchSchema } from "../lib/progress.js";
import { saveLearnProgress, ProgressSaveError } from "../lib/enrollments.js";
import { Hono } from "hono";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/require-auth.js";
import { getContentEntry } from "../lib/content.js";
import {
  getLearnEnrollmentForContent,
  listLearnEnrollmentsForNeonUser,
} from "../lib/enrollments.js";
import { getTotalPointsForNeonUser } from "../lib/points.js";
import { getTargetPointsForNeonUser, getStudentByNeonUserId } from "../lib/students.js";
import { getCompletedAssessmentsForStudent, getAssessmentDetailById } from "../lib/assessments.js";
import type { AppEnv, SessionResponse } from "../types.js";
import {
  getNotificationsForStudent,
  getUnreadCount,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
} from "../lib/notifications.js";

export const learnRoutes = new Hono<AppEnv>();

learnRoutes.get("/user", requireAuth, async (c) => {
  const user = c.get("user");
  console.log('[DEBUG] /learn/user called for user:', user.id);
  
  // Fetch student and completed assessments
  let completedAssessments: Awaited<ReturnType<typeof getCompletedAssessmentsForStudent>> = [];
  let unreadNotificationCount = 0;
  let student: Awaited<ReturnType<typeof getStudentByNeonUserId>> | null = null;

  try {
    student = await getStudentByNeonUserId(user.id);
    console.log('[DEBUG] Student found:', student ? student.id : 'null');
    if (student) {
      completedAssessments = await getCompletedAssessmentsForStudent(student.id);
      // Get unread notification count
      if (env.DATABASE_URL) {
        try {
          unreadNotificationCount = await getUnreadCount(student.id);
        } catch (error) {
          console.error("Error fetching unread notification count:", error);
        }
      }
    } else {
      console.log('[DEBUG] No student record found for neon user:', user.id);
    }
  } catch (error) {
    console.error("Error fetching completed assessments:", error);
    // Continue without assessments rather than failing the entire request
  }

  const [enrollments, totalPoints, targetPoints] = await Promise.all([
    listLearnEnrollmentsForNeonUser(user.id),
    getTotalPointsForNeonUser(user.id),
    getTargetPointsForNeonUser(user.id),
  ]);
  
  console.log('[DEBUG] Returning', completedAssessments.length, 'completed assessments');
  
  const body: SessionResponse = {
    authenticated: true,
    user,
    enrollments,
    totalPoints,
    targetPoints,
    completedAssessments,
    unreadNotificationCount,
  };

  return c.json(body);
});

learnRoutes.get("/content/:id", requireAuth, async (c) => {
  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const entryId = c.req.param("id").trim();

  if (!entryId) {
    return c.json({ error: "Content not found." }, 404);
  }

  const content = await getContentEntry(entryId);

  if (!content) {
    return c.json({ error: "Content not found." }, 404);
  }

  const enrollment = await getLearnEnrollmentForContent(
    c.get("user").id,
    content.entryId
  );

  if (!enrollment) {
    return c.json({ error: "Not enrolled in this content." }, 403);
  }

  return c.json({
    content,
    progressStatus: enrollment.progressStatus,
    progress: enrollment.progress,
  });
});


learnRoutes.patch("/content/:id/progress", requireAuth, async (c) => {
  if (!env.DATABASE_URL) return c.json({ error: "Database is not configured." }, 503);
  let body: unknown;
  try { body = await c.req.json(); }
  catch { return c.json({ error: "Invalid JSON body." }, 400); }
  const parsed = progressPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid progress changes.", details: parsed.error.issues }, 400);
  if (
    parsed.data.action === "complete" &&
    (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN)
  ) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }
  try {
    return c.json(await saveLearnProgress(c.get("user").id, c.req.param("id"), parsed.data));
  } catch (error) {
    if (error instanceof ProgressSaveError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});

// GET /learn/assessment/:assessmentId - Get assessment details
learnRoutes.get("/assessment/:assessmentId", requireAuth, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const assessmentId = c.req.param("assessmentId").trim();

  if (!assessmentId) {
    return c.json({ error: "Assessment not found." }, 404);
  }

  const assessment = await getAssessmentDetailById(assessmentId);

  if (!assessment) {
    return c.json({ error: "Assessment not found." }, 404);
  }

  return c.json(assessment);
});

// Notification endpoints

// GET /learn/notifications - List notifications for authenticated student
learnRoutes.get("/notifications", requireAuth, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const user = c.get("user");
  
  // Get student from neon user ID
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  const unreadOnly = c.req.query("unread") === "true";
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  
  try {
    const result = await getNotificationsForStudent(student.id, {
      unreadOnly,
      limit,
      offset,
    });
    
    return c.json(result);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
});

// GET /learn/notifications/unread-count - Get just the count of unread notifications
learnRoutes.get("/notifications/unread-count", requireAuth, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ count: 0 });
  }

  const user = c.get("user");
  
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ count: 0 });
  }
  
  try {
    const count = await getUnreadCount(student.id);
    return c.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return c.json({ count: 0 });
  }
});

// PATCH /learn/notifications/:id/read - Mark a single notification as read
learnRoutes.patch("/notifications/:id/read", requireAuth, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const user = c.get("user");
  const notificationId = c.req.param("id");
  
  // Verify the notification belongs to this student
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  try {
    await markNotificationsAsRead([notificationId]);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return c.json({ error: "Failed to mark notification as read" }, 500);
  }
});

// PATCH /learn/notifications/read-all - Mark all notifications as read
learnRoutes.patch("/notifications/read-all", requireAuth, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const user = c.get("user");
  
  const student = await getStudentByNeonUserId(user.id);
  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }
  
  try {
    const count = await markAllNotificationsAsRead(student.id);
    return c.json({ success: true, count });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return c.json({ error: "Failed to mark all notifications as read" }, 500);
  }
});
