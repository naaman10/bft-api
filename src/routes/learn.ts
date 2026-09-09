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
import type { AppEnv, SessionResponse } from "../types.js";

export const learnRoutes = new Hono<AppEnv>();

learnRoutes.get("/user", requireAuth, async (c) => {
  const user = c.get("user");
  const enrollments = await listLearnEnrollmentsForNeonUser(user.id);
  const body: SessionResponse = {
    authenticated: true,
    user,
    enrollments,
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
  try {
    return c.json(await saveLearnProgress(c.get("user").id, c.req.param("id"), parsed.data));
  } catch (error) {
    if (error instanceof ProgressSaveError) return c.json({ error: error.message }, error.status);
    throw error;
  }
});
