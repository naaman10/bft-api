import { getDb } from "./db.js";

export class StudentNotFoundError extends Error {
  constructor() {
    super("Student not found.");
    this.name = "StudentNotFoundError";
  }
}

export class StudentAlreadyLinkedError extends Error {
  constructor() {
    super("This student already has a Neon Auth user.");
    this.name = "StudentAlreadyLinkedError";
  }
}

export type Student = {
  id: string;
  email: string;
  name: string;
  neonUserId: string | null;
  invitedAt: string | null;
};

type StudentRow = {
  id: string;
  email: string;
  name: string;
  neon_user_id: string | null;
  invited_at: string | Date | null;
};

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    neonUserId: row.neon_user_id,
    invitedAt:
      row.invited_at instanceof Date
        ? row.invited_at.toISOString()
        : row.invited_at,
  };
}

export async function getStudentById(id: string): Promise<Student | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, neon_user_id, invited_at
    FROM students
    WHERE id = ${id}::uuid
    LIMIT 1
  `;

  const row = rows[0] as StudentRow | undefined;
  return row ? toStudent(row) : null;
}

export async function getStudentByNeonUserId(
  neonUserId: string
): Promise<Student | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, name, neon_user_id, invited_at
    FROM students
    WHERE neon_user_id = ${neonUserId}::uuid
    LIMIT 1
  `;

  const row = rows[0] as StudentRow | undefined;
  return row ? toStudent(row) : null;
}

export async function linkStudentToNeonUser(input: {
  studentId: string;
  neonUserId: string;
  email: string;
  name: string;
}): Promise<Student> {
  const student = await getStudentById(input.studentId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  if (student.neonUserId && student.neonUserId !== input.neonUserId) {
    throw new StudentAlreadyLinkedError();
  }

  const sql = getDb();
  const rows = await sql`
    UPDATE students
    SET
      neon_user_id = ${input.neonUserId}::uuid,
      email = ${input.email},
      name = ${input.name},
      invited_at = COALESCE(invited_at, NOW()),
      updated_at = NOW()
    WHERE id = ${input.studentId}::uuid
    RETURNING id, email, name, neon_user_id, invited_at
  `;

  const row = rows[0] as StudentRow | undefined;

  if (!row) {
    throw new StudentNotFoundError();
  }

  return toStudent(row);
}
