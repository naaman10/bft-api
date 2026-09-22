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
import { getCompletedAssessmentsForStudent } from "../lib/assessments.js";
import type { AppEnv, SessionResponse } from "../types.js";

export const learnRoutes = new Hono<AppEnv>();

learnRoutes.get("/user", requireAuth, async (c) => {
  const user = c.get("user");
  console.log('[DEBUG] /learn/user called for user:', user.id);
  
  // Fetch student and completed assessments
  let completedAssessments: Awaited<ReturnType<typeof getCompletedAssessmentsForStudent>> = [];
  try {
    const student = await getStudentByNeonUserId(user.id);
    console.log('[DEBUG] Student found:', student ? student.id : 'null');
    if (student) {
      completedAssessments = await getCompletedAssessmentsForStudent(student.id);
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
