import { getDb } from "./db.js";
import { getEnrollmentById, type EnrollmentWithStudent } from "./enrollments.js";
import { getContentMarkingScheme } from "./content.js";

export type AssessmentStatus = "in_progress" | "completed";

export type Assessment = {
  id: string;
  enrollmentId: string;
  assessedBy: string;
  status: AssessmentStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type QuestionGrade = {
  questionId: string;
  pointsEarned: number;
  pointsAvailable: number;
};

export type QuestionFeedback = {
  questionId: string;
  feedback: string;
};

export type AssessmentData = {
  assessment: Assessment;
  questionGrades: QuestionGrade[];
  questionFeedback: QuestionFeedback[];
  overallFeedback: string | null;
};

export class AssessmentError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 409 | 500, message: string) {
    super(message);
  }
}

type AssessmentRow = {
  id: string;
  enrollment_id: string;
  assessed_by: string;
  status: AssessmentStatus;
  started_at: string | Date;
  completed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toIso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    assessedBy: row.assessed_by,
    status: row.status,
    startedAt: toIso(row.started_at) ?? "",
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? "",
  };
}

export async function getAssessmentByEnrollmentId(
  enrollmentId: string
): Promise<AssessmentData | null> {
  const sql = getDb();

  const assessmentRows = await sql`
    SELECT
      id,
      enrollment_id,
      assessed_by,
      status,
      started_at,
      completed_at,
      created_at,
      updated_at
    FROM assessments
    WHERE enrollment_id = ${enrollmentId}::uuid
    LIMIT 1
  `;

  if (assessmentRows.length === 0) {
    return null;
  }

  const assessment = toAssessment(assessmentRows[0] as AssessmentRow);

  const gradeRows = await sql`
    SELECT question_id, points_earned, points_available
    FROM assessment_question_grades
    WHERE assessment_id = ${assessment.id}::uuid
  `;

  const feedbackRows = await sql`
    SELECT question_id, feedback
    FROM assessment_question_feedback
    WHERE assessment_id = ${assessment.id}::uuid
  `;

  const overallFeedbackRows = await sql`
    SELECT feedback
    FROM assessment_feedback
    WHERE assessment_id = ${assessment.id}::uuid
    LIMIT 1
  `;

  return {
    assessment,
    questionGrades: gradeRows.map((row) => ({
      questionId: String(row.question_id),
      pointsEarned: Number(row.points_earned),
      pointsAvailable: Number(row.points_available),
    })),
    questionFeedback: feedbackRows.map((row) => ({
      questionId: String(row.question_id),
      feedback: String(row.feedback),
    })),
    overallFeedback: overallFeedbackRows[0]
      ? String(overallFeedbackRows[0].feedback)
      : null,
  };
}

export type SaveAssessmentInput = {
  enrollmentId: string;
  assessedBy: string;
  questionGrades?: QuestionGrade[];
  questionFeedback?: QuestionFeedback[];
  overallFeedback?: string;
};

export async function saveAssessment(
  input: SaveAssessmentInput
): Promise<AssessmentData> {
  const sql = getDb();

  // Verify enrollment exists and get content info
  const enrollment = await getEnrollmentById(input.enrollmentId);

  if (!enrollment) {
    throw new AssessmentError(404, "Enrollment not found.");
  }

  // Verify enrollment is in correct status
  if (enrollment.progressStatus !== "to_assess" && enrollment.progressStatus !== "assessed") {
    throw new AssessmentError(
      403,
      "Enrollment is not ready for assessment. Student must complete the content first."
    );
  }

  // Verify content requires assessment
  const markingScheme = await getContentMarkingScheme(enrollment.contentId);

  if (!markingScheme) {
    throw new AssessmentError(404, "Content not found.");
  }

  if (!markingScheme.requiresAssessment) {
    throw new AssessmentError(
      403,
      "This content does not require assessment."
    );
  }

  // Validate question IDs exist in marking scheme
  const validQuestionIds = new Set(
    markingScheme.questions.map((q) => q.questionId)
  );

  if (input.questionGrades) {
    for (const grade of input.questionGrades) {
      if (!validQuestionIds.has(grade.questionId)) {
        throw new AssessmentError(
          400,
          `Invalid question ID: ${grade.questionId}`
        );
      }

      const question = markingScheme.questions.find(
        (q) => q.questionId === grade.questionId
      );

      if (question && grade.pointsAvailable !== question.points) {
        throw new AssessmentError(
          400,
          `Points available mismatch for question ${grade.questionId}. Expected ${question.points}, got ${grade.pointsAvailable}.`
        );
      }

      if (grade.pointsEarned < 0 || grade.pointsEarned > grade.pointsAvailable) {
        throw new AssessmentError(
          400,
          `Points earned must be between 0 and ${grade.pointsAvailable} for question ${grade.questionId}.`
        );
      }
    }
  }

  if (input.questionFeedback) {
    for (const feedback of input.questionFeedback) {
      if (!validQuestionIds.has(feedback.questionId)) {
        throw new AssessmentError(
          400,
          `Invalid question ID for feedback: ${feedback.questionId}`
        );
      }
    }
  }

  // Create or update assessment
  const assessmentRows = await sql`
    INSERT INTO assessments (enrollment_id, assessed_by, status)
    VALUES (${input.enrollmentId}::uuid, ${input.assessedBy}::uuid, 'in_progress')
    ON CONFLICT (enrollment_id) DO UPDATE SET
      assessed_by = ${input.assessedBy}::uuid,
      updated_at = NOW()
    RETURNING
      id,
      enrollment_id,
      assessed_by,
      status,
      started_at,
      completed_at,
      created_at,
      updated_at
  `;

  const assessment = toAssessment(assessmentRows[0] as AssessmentRow);

  // Save question grades
  if (input.questionGrades && input.questionGrades.length > 0) {
    const questionIds = input.questionGrades.map((g) => g.questionId);
    const pointsEarned = input.questionGrades.map((g) => g.pointsEarned);
    const pointsAvailable = input.questionGrades.map((g) => g.pointsAvailable);

    await sql`
      INSERT INTO assessment_question_grades (
        assessment_id,
        question_id,
        points_earned,
        points_available
      )
      SELECT
        ${assessment.id}::uuid,
        grade.question_id,
        grade.points_earned,
        grade.points_available
      FROM unnest(
        ${questionIds}::text[],
        ${pointsEarned}::integer[],
        ${pointsAvailable}::integer[]
      ) AS grade(question_id, points_earned, points_available)
      ON CONFLICT (assessment_id, question_id) DO UPDATE SET
        points_earned = EXCLUDED.points_earned,
        points_available = EXCLUDED.points_available,
        updated_at = NOW()
    `;
  }

  // Save question feedback
  if (input.questionFeedback && input.questionFeedback.length > 0) {
    const questionIds = input.questionFeedback.map((f) => f.questionId);
    const feedbacks = input.questionFeedback.map((f) => f.feedback);

    await sql`
      INSERT INTO assessment_question_feedback (
        assessment_id,
        question_id,
        feedback
      )
      SELECT
        ${assessment.id}::uuid,
        fb.question_id,
        fb.feedback
      FROM unnest(
        ${questionIds}::text[],
        ${feedbacks}::text[]
      ) AS fb(question_id, feedback)
      ON CONFLICT (assessment_id, question_id) DO UPDATE SET
        feedback = EXCLUDED.feedback,
        updated_at = NOW()
    `;
  }

  // Save overall feedback
  if (input.overallFeedback !== undefined) {
    const trimmedFeedback = input.overallFeedback.trim();
    
    if (trimmedFeedback) {
      await sql`
        INSERT INTO assessment_feedback (assessment_id, feedback)
        VALUES (${assessment.id}::uuid, ${trimmedFeedback})
        ON CONFLICT (assessment_id) DO UPDATE SET
          feedback = ${trimmedFeedback},
          updated_at = NOW()
      `;
    } else {
      // Delete if empty
      await sql`
        DELETE FROM assessment_feedback
        WHERE assessment_id = ${assessment.id}::uuid
      `;
    }
  }

  // Return the saved assessment data
  const result = await getAssessmentByEnrollmentId(input.enrollmentId);

  if (!result) {
    throw new AssessmentError(500, "Failed to retrieve saved assessment.");
  }

  return result;
}

export async function completeAssessment(
  enrollmentId: string,
  assessedBy: string
): Promise<AssessmentData> {
  const sql = getDb();

  // Get existing assessment
  const existing = await getAssessmentByEnrollmentId(enrollmentId);

  if (!existing) {
    throw new AssessmentError(
      404,
      "Assessment not found. Please save assessment data first."
    );
  }

  if (existing.assessment.status === "completed") {
    throw new AssessmentError(409, "Assessment is already completed.");
  }

  // Verify enrollment exists
  const enrollment = await getEnrollmentById(enrollmentId);

  if (!enrollment) {
    throw new AssessmentError(404, "Enrollment not found.");
  }

  // Get marking scheme to validate all questions are graded
  const markingScheme = await getContentMarkingScheme(enrollment.contentId);

  if (!markingScheme) {
    throw new AssessmentError(404, "Content not found.");
  }

  // Verify all questions have grades
  const requiredQuestionIds = new Set(
    markingScheme.questions.map((q) => q.questionId)
  );
  const gradedQuestionIds = new Set(
    existing.questionGrades.map((g) => g.questionId)
  );

  const missingGrades = Array.from(requiredQuestionIds).filter(
    (id) => !gradedQuestionIds.has(id)
  );

  if (missingGrades.length > 0) {
    throw new AssessmentError(
      400,
      `Cannot complete assessment. Missing grades for questions: ${missingGrades.join(", ")}`
    );
  }

  // Complete assessment and update enrollment atomically using CTE
  const nonZeroGrades = existing.questionGrades.filter(
    (g) => g.pointsEarned > 0
  );

  if (nonZeroGrades.length > 0) {
    const nonZeroQuestionIds = nonZeroGrades.map((g) => g.questionId);
    const nonZeroPointsEarned = nonZeroGrades.map((g) => g.pointsEarned);
    const nonZeroPointsAvailable = nonZeroGrades.map((g) => g.pointsAvailable);

    await sql`
      WITH updated_assessment AS (
        UPDATE assessments
        SET
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        WHERE enrollment_id = ${enrollmentId}::uuid
          AND status = 'in_progress'
        RETURNING enrollment_id
      ), updated_enrollment AS (
        UPDATE enrollments
        SET
          progress_status = 'assessed',
          updated_at = NOW()
        WHERE id = (SELECT enrollment_id FROM updated_assessment)
        RETURNING student_id, content_id
      )
      INSERT INTO points (
        student_id,
        content_id,
        question_id,
        points_earned,
        points_available,
        source,
        awarded_by
      )
      SELECT
        (SELECT student_id FROM updated_enrollment),
        (SELECT content_id FROM updated_enrollment),
        award.question_id,
        award.points_earned,
        award.points_available,
        'assessment',
        ${assessedBy}::uuid
      FROM unnest(
        ${nonZeroQuestionIds}::text[],
        ${nonZeroPointsEarned}::integer[],
        ${nonZeroPointsAvailable}::integer[]
      ) AS award(question_id, points_earned, points_available)
      ON CONFLICT (student_id, question_id) DO UPDATE SET
        points_earned = EXCLUDED.points_earned,
        points_available = EXCLUDED.points_available,
        source = EXCLUDED.source,
        awarded_by = EXCLUDED.awarded_by,
        updated_at = NOW()
    `;
  } else {
    // No points to award, just update assessment and enrollment
    await sql`
      WITH updated_assessment AS (
        UPDATE assessments
        SET
          status = 'completed',
          completed_at = NOW(),
          updated_at = NOW()
        WHERE enrollment_id = ${enrollmentId}::uuid
          AND status = 'in_progress'
        RETURNING enrollment_id
      )
      UPDATE enrollments
      SET
        progress_status = 'assessed',
        updated_at = NOW()
      WHERE id = (SELECT enrollment_id FROM updated_assessment)
    `;
  }

  // Return the completed assessment
  const result = await getAssessmentByEnrollmentId(enrollmentId);

  if (!result) {
    throw new AssessmentError(500, "Failed to retrieve completed assessment.");
  }

  return result;
}

/**
 * Add general feedback to any enrollment.
 * 
 * This works for ALL enrollments regardless of:
 * - requiresAssessment flag (true or false)
 * - progress_status (not_started, in_progress, completed, to_assess, assessed)
 * - Whether an assessment exists or not
 * 
 * Use cases:
 * - Add feedback to auto-marked content (requiresAssessment=false, status=completed)
 * - Add feedback to assessed content (requiresAssessment=true, status=assessed)
 * - Add encouragement during in-progress work
 * - Multiple feedback entries are allowed per enrollment
 */
export async function addEnrollmentFeedback(
  enrollmentId: string,
  feedback: string,
  createdBy: string
): Promise<void> {
  const sql = getDb();

  // Verify enrollment exists (only validation - no status checks)
  const enrollment = await getEnrollmentById(enrollmentId);

  if (!enrollment) {
    throw new AssessmentError(404, "Enrollment not found.");
  }

  // Insert feedback - works for ANY enrollment regardless of status
  await sql`
    INSERT INTO enrollment_feedback (enrollment_id, feedback, created_by)
    VALUES (${enrollmentId}::uuid, ${feedback}, ${createdBy}::uuid)
  `;
}

export type EnrollmentFeedback = {
  id: string;
  enrollmentId: string;
  feedback: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export async function getEnrollmentFeedback(
  enrollmentId: string
): Promise<EnrollmentFeedback[]> {
  const sql = getDb();

  const rows = await sql`
    SELECT
      id,
      enrollment_id,
      feedback,
      created_by,
      created_at,
      updated_at
    FROM enrollment_feedback
    WHERE enrollment_id = ${enrollmentId}::uuid
    ORDER BY created_at DESC
  `;

  return rows.map((row) => ({
    id: String(row.id),
    enrollmentId: String(row.enrollment_id),
    feedback: String(row.feedback),
    createdBy: String(row.created_by),
    createdAt: toIso(row.created_at as string | Date) ?? "",
    updatedAt: toIso(row.updated_at as string | Date) ?? "",
  }));
}
