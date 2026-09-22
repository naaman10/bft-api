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
import {
  saveAssessment,
  completeAssessment,
  getAssessmentByEnrollmentId,
  addEnrollmentFeedback,
  getEnrollmentFeedback,
  AssessmentError,
} from "../lib/assessments.js";
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

const questionGradeSchema = z.object({
  questionId: z.string().trim().min(1),
  pointsEarned: z.number().int().nonnegative(),
  pointsAvailable: z.number().int().positive(),
});

const questionFeedbackSchema = z.object({
  questionId: z.string().trim().min(1),
  feedback: z.string().trim().min(1),
});

const saveAssessmentBody = z.object({
  assessedBy: z.string().uuid(),
  questionGrades: z.array(questionGradeSchema).optional(),
  questionFeedback: z.array(questionFeedbackSchema).optional(),
  overallFeedback: z.string().optional(),
});

const completeAssessmentBody = z.object({
  assessedBy: z.string().uuid(),
});

const enrollmentFeedbackBody = z.object({
  feedback: z.string().trim().min(1),
  createdBy: z.string().uuid(),
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

  function extractQuestions(value: unknown, collected: QuestionWithAnswers[]): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        extractQuestions(item, collected);
      }
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const record = value as Record<string, unknown>;
    const contentType = record.contentType;
    const entryId = record.entryId;
    const fields = record.fields as Record<string, unknown> | undefined;

    if (
      fields &&
      entryId &&
      typeof entryId === "string" &&
      (contentType === "question" || contentType === "questionMultipleChoice")
    ) {
      const points = fields.points;
      const correctAnswer = fields.answer;
      const progressItem = progressItems[entryId];

      if (
        correctAnswer !== undefined &&
        typeof points === "number" &&
        Number.isInteger(points) &&
        points > 0
      ) {
        collected.push({
          questionId: entryId,
          questionContent: fields,
          studentAnswer: progressItem?.answer,
          correctAnswer,
          points,
          status: progressItem?.status ?? "not_started",
          updatedAt: progressItem?.updatedAt,
          completedAt: progressItem?.completedAt,
        });
      }
    }

    for (const child of Object.values(fields ?? record)) {
      extractQuestions(child, collected);
    }
  }

  extractQuestions(content.fields, questions);

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

adminRoutes.post("/assessment/:enrollmentId", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("enrollmentId"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = saveAssessmentBody.safeParse(body);

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

  try {
    const result = await saveAssessment({
      enrollmentId: enrollmentId.data,
      assessedBy: parsed.data.assessedBy,
      questionGrades: parsed.data.questionGrades,
      questionFeedback: parsed.data.questionFeedback,
      overallFeedback: parsed.data.overallFeedback,
    });

    return c.json(result, 200);
  } catch (error) {
    if (error instanceof AssessmentError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

adminRoutes.post("/assessment/:enrollmentId/complete", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  if (!env.CONTENTFUL_SPACE_ID || !env.CONTENTFUL_ACCESS_TOKEN) {
    return c.json({ error: "Contentful is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("enrollmentId"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = completeAssessmentBody.safeParse(body);

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

  try {
    const result = await completeAssessment(
      enrollmentId.data,
      parsed.data.assessedBy
    );

    return c.json(result, 200);
  } catch (error) {
    if (error instanceof AssessmentError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

adminRoutes.get("/assessment/:enrollmentId", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("enrollmentId"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  const assessment = await getAssessmentByEnrollmentId(enrollmentId.data);

  if (!assessment) {
    return c.json({ error: "Assessment not found." }, 404);
  }

  return c.json(assessment, 200);
});

adminRoutes.post("/enrollment/:enrollmentId/feedback", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("enrollmentId"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = enrollmentFeedbackBody.safeParse(body);

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

  try {
    await addEnrollmentFeedback(
      enrollmentId.data,
      parsed.data.feedback,
      parsed.data.createdBy
    );

    return c.json({ success: true }, 201);
  } catch (error) {
    if (error instanceof AssessmentError) {
      return c.json({ error: error.message }, error.status);
    }
    throw error;
  }
});

adminRoutes.get("/enrollment/:enrollmentId/feedback", requireAdmin, async (c) => {
  if (!env.DATABASE_URL) {
    return c.json({ error: "Database is not configured." }, 503);
  }

  const enrollmentId = z.string().uuid().safeParse(c.req.param("enrollmentId"));

  if (!enrollmentId.success) {
    return c.json({ error: "Invalid enrollment id." }, 400);
  }

  const feedback = await getEnrollmentFeedback(enrollmentId.data);

  return c.json({ feedback }, 200);
});
