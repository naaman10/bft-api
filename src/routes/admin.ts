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
import {
  getContentItemsByIds,
  getMissingContentIds,
  listContent,
  getContentEntryWithAnswers,
} from "../lib/content.js";
import {
  enrollStudentInContent,
  listAdminEnrollmentsForStudent,
  getEnrollmentById,
} from "../lib/enrollments.js";
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
  studentId: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().uuid().optional()
  ),
});

const enrollBody = z.object({
  contentIds: z.array(z.string().trim().min(1)).min(1),
});

const reviewBody = z.object({
  adminUserId: z.string().uuid(),
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
    studentId: c.req.query("studentId"),
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

  const { studentId, ...filters } = parsed.data;
  const content = await listContent(filters);

  if (!studentId) {
    return c.json({ ...content, enrollments: [] });
  }

  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  try {
    const assigned = await listAdminEnrollmentsForStudent(studentId);
    const contentById = await getContentItemsByIds(
      assigned.map((enrollment) => enrollment.contentId)
    );
    const enrollments = assigned.map((enrollment) => {
      const item = contentById.get(enrollment.contentId);

      return {
        enrollmentID: enrollment.id,
        entryId: enrollment.contentId,
        name: item?.name ?? "",
        type: item?.type ?? "",
        subject: item?.subject ?? "",
        ageGroup: item?.ageGroup ?? "",
        status: enrollment.status,
        progressStatus: enrollment.progressStatus,
      };
    });

    return c.json({ ...content, enrollments });
  } catch (error) {
    if (error instanceof StudentNotFoundError) {
      return c.json({ error: "Student not found." }, 404);
    }
    throw error;
  }
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

adminRoutes.post("/review/:id", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("id"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = reviewBody.safeParse(body);

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

  const enrollment = await getEnrollmentById(enrollmentId.data);

  if (!enrollment) {
    return c.json({ error: "Enrollment not found." }, 404);
  }

  // Get raw Contentful entry with full depth to ensure nested questions are included
  const { getContentful } = await import("../lib/contentful.js");
  const client = getContentful();
  
  let rawEntry;
  try {
    rawEntry = await client.getEntry(enrollment.contentId, { include: 10 });
  } catch (error: any) {
    if (error.sys?.id === "NotFound" || error.response?.status === 404) {
      return c.json({ error: "Content not found." }, 404);
    }
    throw error;
  }

  // Also get serialized content for metadata
  const content = await getContentEntryWithAnswers(enrollment.contentId);

  if (!content) {
    return c.json({ error: "Content not found." }, 404);
  }

  type QuestionWithAnswers = {
    questionId: string;
    questionContent: unknown;
    studentAnswer: unknown;
    correctAnswer: unknown;
    points: number;
    status: string;
    updatedAt?: string;
    completedAt?: string;
  };

  const questions: QuestionWithAnswers[] = [];
  const progressItems = enrollment.progress.items;

  // Extract questions from raw Contentful entry structure
  function extractQuestionsFromRaw(value: unknown, collected: QuestionWithAnswers[], seen = new WeakSet<object>()): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        extractQuestionsFromRaw(item, collected, seen);
      }
      return;
    }

    if (!value || typeof value !== "object" || seen.has(value)) {
      return;
    }

    seen.add(value);
    const record = value as Record<string, unknown>;
    const sys = record.sys as 
      | { id?: string; contentType?: { sys?: { id?: string } } }
      | undefined;
    const fields = record.fields as Record<string, unknown> | undefined;
    const contentType = sys?.contentType?.sys?.id;

    // Check if this is a question entry
    if (
      fields &&
      sys?.id &&
      (contentType === "question" || contentType === "questionMultipleChoice")
    ) {
      const points = fields.points;
      const correctAnswer = fields.answer;
      const progressItem = progressItems[sys.id];

      console.log('[DEBUG] Found question entry:', {
        questionId: sys.id,
        contentType,
        hasFields: !!fields,
        fieldKeys: Object.keys(fields),
        correctAnswer,
        points,
        hasProgressItem: !!progressItem,
        studentAnswer: progressItem?.answer
      });

      // Include question if it has valid points, regardless of whether it has a correct answer
      // (manually assessed questions don't have pre-defined correct answers)
      if (
        typeof points === "number" &&
        Number.isInteger(points) &&
        points > 0
      ) {
        collected.push({
          questionId: sys.id,
          questionContent: fields,
          studentAnswer: progressItem?.answer,
          correctAnswer: correctAnswer !== undefined ? correctAnswer : null,
          points,
          status: progressItem?.status ?? "not_started",
          updatedAt: progressItem?.updatedAt,
          completedAt: progressItem?.completedAt,
        });
      } else {
        console.log('[DEBUG] Question not added:', {
          reason: !(typeof points === "number") ? 'points not number' :
                  !Number.isInteger(points) ? 'points not integer' :
                  !(points > 0) ? 'points not positive' : 'unknown'
        });
      }
      return; // Don't traverse deeper into question fields
    }

    // Recursively search through fields
    for (const child of Object.values(fields ?? record)) {
      extractQuestionsFromRaw(child, collected, seen);
    }
  }

  // Extract from the raw entry's fields
  const rawFields = rawEntry.fields as Record<string, unknown>;
  
  // Search through all fields to find questions
  extractQuestionsFromRaw(rawFields, questions);
  
  console.log('[DEBUG] Raw entry structure:', {
    hasFields: !!rawFields,
    fieldKeys: rawFields ? Object.keys(rawFields) : [],
    hasSections: !!rawFields?.sections,
    questionsFound: questions.length,
    progressItemKeys: Object.keys(progressItems)
  });

  return c.json({
    enrollment: {
      id: enrollment.id,
      studentId: enrollment.studentId,
      contentId: enrollment.contentId,
      status: enrollment.status,
      progressStatus: enrollment.progressStatus,
      enrolledAt: enrollment.enrolledAt,
      startedAt: enrollment.startedAt,
      completedAt: enrollment.completedAt,
      lastActivityAt: enrollment.lastActivityAt,
    },
    student: enrollment.student,
    content: {
      entryId: content.entryId,
      name: content.name,
      type: content.type,
      subject: content.subject,
      ageGroup: content.ageGroup,
      stage: content.stage,
      requiresAssessment: content.requiresAssessment,
    },
    sections: content.fields.sections ?? [],
    questions,
  });
});
