import { getDb } from "./db.js";
import { StudentNotFoundError, getStudentById } from "./students.js";

export type EnrollmentStatus = "enrolled" | "withdrawn";
export type ProgressStatus = "not_started" | "in_progress" | "completed";

export type Enrollment = {
  id: string;
  studentId: string;
  contentId: string;
  status: EnrollmentStatus;
  progressStatus: ProgressStatus;
  progress: Record<string, unknown>;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
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

function toProgress(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function toEnrollment(row: EnrollmentRow): Enrollment {
  return {
    id: row.id,
    studentId: row.student_id,
    contentId: row.content_id,
    status: row.status,
    progressStatus: row.progress_status,
    progress: toProgress(row.progress),
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
