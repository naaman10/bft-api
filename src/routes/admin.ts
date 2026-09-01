import { Hono } from "hono";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  DuplicateUserError,
  createAuthUser,
  requestMagicLink,
} from "../lib/neon-auth.js";
import {
  StudentAlreadyLinkedError,
  StudentNotFoundError,
  getStudentById,
  linkStudentToNeonUser,
} from "../lib/students.js";
import { getMissingContentIds, listContent } from "../lib/content.js";
import { enrollStudentInContent } from "../lib/enrollments.js";
import type { AppEnv } from "../types.js";

const createUserBody = z.object({
  studentId: z.string().uuid(),
  email: z
    .string()
    .trim()
    .email()
    .max(256)
    .transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(255),
});

const optionalFilter = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

const contentQuery = z.object({
  type: optionalFilter,
  subject: optionalFilter,
  ageGroup: optionalFilter,
});

const enrollBody = z.object({
  contentIds: z.array(z.string().trim().min(1)).min(1),
});

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post("/user/create", requireAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = createUserBody.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid request body.",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  const existing = await getStudentById(parsed.data.studentId);

  if (!existing) {
    return c.json({ error: "Student not found." }, 404);
  }

  if (existing.neonUserId) {
    return c.json(
      { error: "This student already has a Neon Auth user." },
      409
    );
  }

  let user;
  try {
    user = await createAuthUser({
      email: parsed.data.email,
      name: parsed.data.name,
    });
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }

  let student;
  try {
    student = await linkStudentToNeonUser({
      studentId: parsed.data.studentId,
      neonUserId: user.id,
      email: parsed.data.email,
      name: parsed.data.name,
    });
  } catch (error) {
    if (
      error instanceof StudentNotFoundError ||
      error instanceof StudentAlreadyLinkedError
    ) {
      console.error(error);
      return c.json(
        {
          user,
          student: null,
          inviteSent: false,
          error: "Auth user created but the student record could not be updated.",
        },
        201
      );
    }
    throw error;
  }

  try {
    await requestMagicLink(user.email);
  } catch (error) {
    console.error(error);
    return c.json(
      {
        user,
        student,
        inviteSent: false,
        error: "User created but the invite email could not be sent.",
      },
      201
    );
  }

  return c.json({ user, student, inviteSent: true }, 201);
});

adminRoutes.get("/content", requireAdmin, async (c) => {
  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const parsed = contentQuery.safeParse({
    type: c.req.query("type"),
    subject: c.req.query("subject"),
    ageGroup: c.req.query("ageGroup"),
  });

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid query parameters.",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  return c.json(await listContent(parsed.data));
});

adminRoutes.post("/enroll/:studentId", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const studentId = z.string().uuid().safeParse(c.req.param("studentId"));

  if (!studentId.success) {
    return c.json({ error: "Invalid student id." }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = enrollBody.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid request body.",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  const missing = await getMissingContentIds(parsed.data.contentIds);

  if (missing.length > 0) {
    return c.json(
      { error: "Unknown content IDs.", contentIds: missing },
      400
    );
  }

  try {
    const enrollments = await enrollStudentInContent(
      studentId.data,
      parsed.data.contentIds
    );
    return c.json({ enrollments }, 201);
  } catch (error) {
    if (error instanceof StudentNotFoundError) {
      return c.json({ error: "Student not found." }, 404);
    }
    throw error;
  }
});
