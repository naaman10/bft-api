import { sendCompletionNotification } from "./email.js";
import { env } from "../config/env.js";
import { getContentNamesByIds } from "./content.js";
import { getDb } from "./db.js";
import {
  parseProgress,
  type EnrollmentProgress,
} from "./progress.js";
import {
  StudentNotFoundError,
  getStudentById,
  getStudentByNeonUserId,
} from "./students.js";

export type EnrollmentStatus = "enrolled" | "withdrawn";
export type ProgressStatus = "not_started" | "in_progress" | "completed";

export type Enrollment = {
  id: string;
  studentId: string;
  contentId: string;
  status: EnrollmentStatus;
  progressStatus: ProgressStatus;
  progress: EnrollmentProgress;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LearnEnrollment = {
  contentId: string;
  name: string;
  status: EnrollmentStatus;
  progressStatus: ProgressStatus;
  enrolledAt: string;
};

export type LearnContentEnrollment = {
  contentId: string;
  status: EnrollmentStatus;
  progressStatus: ProgressStatus;
  progress: EnrollmentProgress;
  enrolledAt: string;
};

type EnrollmentRow = {
  id: string;
  student_id: string;
  content_id: string;
  status: EnrollmentStatus;
  progress_status: ProgressStatus;
  progress: unknown;
  enrolled_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  last_activity_at: string | Date | null;
  withdrawn_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    studentId: row.student_id,
    contentId: row.content_id,
    status: row.status,
    progressStatus: row.progress_status,
    progress: parseProgress(row.progress),
    enrolledAt: toIso(row.enrolled_at) ?? "",
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    lastActivityAt: toIso(row.last_activity_at),
    withdrawnAt: toIso(row.withdrawn_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

function uniqueContentIds(contentIds: string[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const value of contentIds) {
    const id = value.trim();

    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export async function enrollStudentInContent(
  studentId: string,
  contentIds: string[]
): Promise<Enrollment[]> {
  const student = await getStudentById(studentId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const ids = uniqueContentIds(contentIds);

  if (ids.length === 0) {
    return [];
  }

  const sql = getDb();
  const rows = await sql`
    INSERT INTO enrollments (student_id, content_id)
    SELECT ${studentId}::uuid, unnest(${ids}::text[])
    ON CONFLICT (student_id, content_id) DO UPDATE SET
      status = 'enrolled',
      withdrawn_at = CASE
        WHEN enrollments.status = 'withdrawn' THEN NULL
        ELSE enrollments.withdrawn_at
      END,
      enrolled_at = CASE
        WHEN enrollments.status = 'withdrawn' THEN NOW()
        ELSE enrollments.enrolled_at
      END,
      updated_at = CASE
        WHEN enrollments.status = 'withdrawn' THEN NOW()
        ELSE enrollments.updated_at
      END
    RETURNING
      id,
      student_id,
      content_id,
      status,
      progress_status,
      progress,
      enrolled_at,
      started_at,
      completed_at,
      last_activity_at,
      withdrawn_at,
      created_at,
      updated_at
  `;

  return (rows as EnrollmentRow[]).map(toEnrollment);
}

type AssignedEnrollmentRow = {
  content_id: string;
  status: EnrollmentStatus;
  progress_status: ProgressStatus;
  enrolled_at: string | Date;
};

export async function listLearnEnrollmentsForNeonUser(
  neonUserId: string
): Promise<LearnEnrollment[]> {
  if (!env.DATABASE_URL) {
    return [];
  }

  let student;

  try {
    student = await getStudentByNeonUserId(neonUserId);
  } catch (error) {
    console.error(error);
    return [];
  }

  if (!student) {
    return [];
  }

  const sql = getDb();
  const rows = (await sql`
    SELECT content_id, status, progress_status, enrolled_at
    FROM enrollments
    WHERE student_id = ${student.id}::uuid
      AND status = 'enrolled'
    ORDER BY enrolled_at DESC
  `) as AssignedEnrollmentRow[];

  if (rows.length === 0) {
    return [];
  }

  let names = new Map<string, string>();

  if (env.CONTENTFUL_SPACE_ID && env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      names = await getContentNamesByIds(rows.map((row) => row.content_id));
    } catch (error) {
      console.error(error);
    }
  }

  return rows.map((row) => ({
    contentId: row.content_id,
    name: names.get(row.content_id) ?? "",
    status: row.status,
    progressStatus: row.progress_status,
    enrolledAt: toIso(row.enrolled_at) ?? "",
  }));
}

type LearnContentEnrollmentRow = {
  content_id: string;
  status: EnrollmentStatus;
  progress_status: ProgressStatus;
  progress: unknown;
  enrolled_at: string | Date;
};

export async function getLearnEnrollmentForContent(
  neonUserId: string,
  contentId: string
): Promise<LearnContentEnrollment | null> {
  if (!env.DATABASE_URL) {
    return null;
  }

  let student;

  try {
    student = await getStudentByNeonUserId(neonUserId);
  } catch (error) {
    console.error(error);
    return null;
  }

  if (!student) {
    return null;
  }

  const sql = getDb();
  const rows = (await sql`
    SELECT content_id, status, progress_status, progress, enrolled_at
    FROM enrollments
    WHERE student_id = ${student.id}::uuid
      AND content_id = ${contentId}
      AND status = 'enrolled'
    LIMIT 1
  `) as LearnContentEnrollmentRow[];

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    contentId: row.content_id,
    status: row.status,
    progressStatus: row.progress_status,
    progress: parseProgress(row.progress),
    enrolledAt: toIso(row.enrolled_at) ?? "",
  };
}


export class ProgressSaveError extends Error {
  constructor(public readonly status: 403 | 409, message: string) { super(message); }
}

export async function saveLearnProgress(neonUserId: string, contentId: string,
  patch: import("./progress.js").ProgressPatch) {
  const { mergeProgress } = await import("./progress.js");
  const sql = getDb();
  // Compare-and-swap avoids losing another tab's changes. The UPDATE rechecks
  // enrollment and completion so a concurrent submission cannot unlock editing.
  for (let attempt = 0; attempt < 4; attempt++) {
    const rows = await sql`
      SELECT e.id, e.progress, e.progress_status, e.status, s.name AS student_name, s.email AS student_email
      FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE s.neon_user_id = ${neonUserId}::uuid AND e.content_id = ${contentId}
    `;
    const row = rows[0];
    if (!row || row.status !== "enrolled")
      throw new ProgressSaveError(403, "Not enrolled in this content.");
    if (row.progress_status === "completed")
      throw new ProgressSaveError(409, "Completed enrollment progress cannot be changed.");
    const progress = mergeProgress(row.progress, patch, new Date().toISOString());
    const updated = await sql`
      UPDATE enrollments SET progress = ${JSON.stringify(progress)}::jsonb,
        progress_status = ${patch.action === "complete" ? "completed" : "in_progress"},
        completed_at = CASE WHEN ${patch.action === "complete"} THEN NOW() ELSE completed_at END,
        started_at = COALESCE(started_at, NOW()),
        last_activity_at = NOW(), updated_at = NOW()
      WHERE id = ${row.id}::uuid AND status = 'enrolled'
        AND progress_status <> 'completed'
        AND progress = ${JSON.stringify(row.progress)}::jsonb
      RETURNING progress, progress_status, completed_at
    `;
    if (updated[0]) {
      let notificationSent: boolean | undefined;
      if (patch.action === "complete") {
        try {
          const names = await getContentNamesByIds([contentId]);
          await sendCompletionNotification({
            enrollmentId: String(row.id),
            completedAt: toIso(updated[0].completed_at as string | Date)!,
            studentName: String(row.student_name),
            studentEmail: String(row.student_email),
            contentName: names.get(contentId) || contentId,
          });
          notificationSent = true;
        } catch {
          // Completion has already committed. Do not ask the pupil to submit again.
          console.error("Completion notification failed for enrollment", row.id);
          notificationSent = false;
        }
      }
      return {
        ...(notificationSent !== undefined ? { notificationSent } : {}),
        progressStatus: updated[0].progress_status,
        completedAt: toIso(updated[0].completed_at as string | Date | null),
        progress: parseProgress(updated[0].progress),
      };
    }
  }
  throw new ProgressSaveError(409, "Progress changed concurrently. Please retry.");
}
