import { env } from "../config/env.js";
import { getDb } from "./db.js";
import { getEnrollmentById, type EnrollmentWithStudent } from "./enrollments.js";
import { getContentMarkingScheme, getContentNamesByIds } from "./content.js";
import { createNotification } from "./notifications.js";

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
  console.log('[DEBUG] saveAssessment called with:', {
    enrollmentId: input.enrollmentId,
    assessedBy: input.assessedBy,
    hasQuestionGrades: !!input.questionGrades,
    gradeCount: input.questionGrades?.length ?? 0,
    hasFeedback: !!input.questionFeedback
  });

  const sql = getDb();

  // Verify enrollment exists and get content info
  const enrollment = await getEnrollmentById(input.enrollmentId);

  if (!enrollment) {
    console.log('[DEBUG] Enrollment not found:', input.enrollmentId);
    throw new AssessmentError(404, "Enrollment not found.");
  }

  console.log('[DEBUG] Enrollment found:', {
    enrollmentId: enrollment.id,
    progressStatus: enrollment.progressStatus,
    contentId: enrollment.contentId
  });

  // Verify enrollment is in correct status
  if (enrollment.progressStatus !== "to_assess" && enrollment.progressStatus !== "assessed") {
    console.log('[DEBUG] Enrollment not ready for assessment:', {
      currentStatus: enrollment.progressStatus,
      requiredStatus: 'to_assess or assessed'
    });
    throw new AssessmentError(
      403,
      "Enrollment is not ready for assessment. Student must complete the content first."
    );
  }

  // Verify content requires assessment
  const markingScheme = await getContentMarkingScheme(enrollment.contentId);

  if (!markingScheme) {
    console.log('[DEBUG] Content marking scheme not found:', enrollment.contentId);
    throw new AssessmentError(404, "Content not found.");
  }

  console.log('[DEBUG] Marking scheme found:', {
    contentId: markingScheme.contentId,
    requiresAssessment: markingScheme.requiresAssessment,
    questionCount: markingScheme.questions.length
  });

  if (!markingScheme.requiresAssessment) {
    console.log('[DEBUG] Content does not require assessment');
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
  console.log('[DEBUG] Creating/updating assessment in database');
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
  console.log('[DEBUG] Assessment created/updated:', {
    assessmentId: assessment.id,
    status: assessment.status
  });

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

  // Create notification for completed assessment
  try {
    const totalPointsEarned = existing.questionGrades.reduce(
      (sum, grade) => sum + grade.pointsEarned,
      0
    );
    const totalPointsAvailable = existing.questionGrades.reduce(
      (sum, grade) => sum + grade.pointsAvailable,
      0
    );
    
    // Get content name
    const contentNames = await getContentNamesByIds([enrollment.contentId]);
    const contentName = contentNames.get(enrollment.contentId) || enrollment.contentId;
    
    await createNotification({
      studentId: enrollment.studentId,
      type: 'assessment',
      title: 'Assessment Graded',
      message: `Your ${contentName} has been graded. You earned ${totalPointsEarned} points!`,
      metadata: {
        contentName,
        pointsEarned: totalPointsEarned,
        pointsAvailable: totalPointsAvailable,
        hasFeedback: !!(existing.overallFeedback || existing.questionFeedback.length > 0),
        assessedBy,
      },
      enrollmentId: enrollment.id,
      assessmentId: existing.assessment.id,
      contentId: enrollment.contentId,
    });
  } catch (error) {
    console.error('Failed to create assessment completion notification:', error);
    // Don't fail the completion if notification fails
  }

  return result;
}

export async function addEnrollmentFeedback(
  enrollmentId: string,
  feedback: string,
  createdBy: string
): Promise<void> {
  const sql = getDb();

  // Verify enrollment exists
  const enrollment = await getEnrollmentById(enrollmentId);

  if (!enrollment) {
    throw new AssessmentError(404, "Enrollment not found.");
  }

  await sql`
    INSERT INTO enrollment_feedback (enrollment_id, feedback, created_by)
    VALUES (${enrollmentId}::uuid, ${feedback}, ${createdBy}::uuid)
  `;

  // Create notification for feedback
  try {
    // Get content name
    const contentNames = await getContentNamesByIds([enrollment.contentId]);
    const contentName = contentNames.get(enrollment.contentId) || enrollment.contentId;
    
    // Create feedback preview (first 100 characters)
    const feedbackPreview = feedback.length > 100 
      ? feedback.substring(0, 100) + '...' 
      : feedback;
    
    await createNotification({
      studentId: enrollment.studentId,
      type: 'feedback',
      title: 'New Feedback',
      message: `Your teacher left feedback on ${contentName}`,
      metadata: {
        contentName,
        feedbackPreview,
      },
      enrollmentId: enrollment.id,
      contentId: enrollment.contentId,
    });
  } catch (error) {
    console.error('Failed to create feedback notification:', error);
    // Don't fail the feedback creation if notification fails
  }
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

export type CompletedAssessment = {
  assessmentId: string;
  enrollmentName: string;
  pointsScored: number;
  pointsAvailable: number;
};

type CompletedAssessmentRow = {
  assessment_id: string;
  content_id: string;
  points_scored: number;
  points_available: number;
};

export async function getCompletedAssessmentsForStudent(
  studentId: string
): Promise<CompletedAssessment[]> {
  console.log('[DEBUG] getCompletedAssessmentsForStudent called with studentId:', studentId);
  
  if (!env.DATABASE_URL) {
    console.log('[DEBUG] DATABASE_URL not configured');
    return [];
  }
  
  const sql = getDb();

  // First, check what assessments exist for this student
  const debugRows = await sql`
    SELECT 
      a.id, 
      a.status, 
      e.student_id,
      e.content_id
    FROM assessments a
    JOIN enrollments e ON e.id = a.enrollment_id
    WHERE e.student_id = ${studentId}::uuid
  `;
  console.log('[DEBUG] Total assessments for student:', debugRows.length);
  debugRows.forEach(row => {
    console.log('[DEBUG] Assessment:', {
      id: row.id,
      status: row.status,
      student_id: row.student_id,
      content_id: row.content_id
    });
  });

  const rows = await sql`
    SELECT
      a.id AS assessment_id,
      e.content_id,
      COALESCE(SUM(aqg.points_earned), 0) AS points_scored,
      COALESCE(SUM(aqg.points_available), 0) AS points_available
    FROM assessments a
    JOIN enrollments e ON e.id = a.enrollment_id
    LEFT JOIN assessment_question_grades aqg ON aqg.assessment_id = a.id
    WHERE a.status = 'completed'
      AND e.student_id = ${studentId}::uuid
    GROUP BY a.id, e.content_id
    ORDER BY a.completed_at DESC
  ` as CompletedAssessmentRow[];

  console.log('[DEBUG] Completed assessments query returned', rows.length, 'rows');

  if (rows.length === 0) {
    return [];
  }

  // Fetch content names from Contentful
  const contentIds = rows.map((row) => row.content_id);
  console.log('[DEBUG] Fetching content names for IDs:', contentIds);
  
  let contentNames = new Map<string, string>();
  
  if (env.CONTENTFUL_SPACE_ID && env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      contentNames = await getContentNamesByIds(contentIds);
      console.log('[DEBUG] Fetched', contentNames.size, 'content names');
    } catch (error) {
      console.error('[ERROR] Failed to fetch content names:', error);
    }
  } else {
    console.log('[DEBUG] Contentful not configured, using content IDs as names');
    // Use content IDs as fallback names
    contentIds.forEach(id => contentNames.set(id, id));
  }

  const result = rows.map((row) => ({
    assessmentId: row.assessment_id,
    enrollmentName: contentNames.get(row.content_id) ?? row.content_id,
    pointsScored: Number(row.points_scored),
    pointsAvailable: Number(row.points_available),
  }));

  console.log('[DEBUG] Returning', result.length, 'completed assessments');
  return result;
}

export type AssessmentDetailQuestion = {
  questionId: string;
  questionText: string;
  pointsAvailable: number;
  pointsEarned: number;
  feedback: string | null;
  userAnswer: unknown;
};

export type AssessmentDetail = {
  assessmentId: string;
  enrollmentName: string;
  totalPointsEarned: number;
  totalPointsAvailable: number;
  questions: AssessmentDetailQuestion[];
  assessmentFeedback: string | null;
  assessmentDate: string | null;
};

export async function getAssessmentDetailById(
  assessmentId: string
): Promise<AssessmentDetail | null> {
  const sql = getDb();

  const assessmentRows = await sql`
    SELECT
      a.id,
      a.enrollment_id,
      a.completed_at,
      e.content_id,
      e.progress
    FROM assessments a
    JOIN enrollments e ON e.id = a.enrollment_id
    WHERE a.id = ${assessmentId}::uuid
    LIMIT 1
  `;

  if (assessmentRows.length === 0) {
    return null;
  }

  const row = assessmentRows[0];
  if (!row) {
    return null;
  }
  
  const contentId = String(row.content_id);
  
  const { parseProgress } = await import("./progress.js");
  const progress = parseProgress(row.progress);
  const progressItems = progress.items;

  let enrollmentName = contentId;
  if (env.CONTENTFUL_SPACE_ID && env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const contentNames = await getContentNamesByIds([contentId]);
      enrollmentName = contentNames.get(contentId) ?? contentId;
    } catch (error) {
      console.error('[ERROR] Failed to fetch content name:', error);
    }
  }

  const gradeRows = await sql`
    SELECT question_id, points_earned, points_available
    FROM assessment_question_grades
    WHERE assessment_id = ${assessmentId}::uuid
  `;

  const feedbackRows = await sql`
    SELECT question_id, feedback
    FROM assessment_question_feedback
    WHERE assessment_id = ${assessmentId}::uuid
  `;

  const overallFeedbackRows = await sql`
    SELECT feedback
    FROM assessment_feedback
    WHERE assessment_id = ${assessmentId}::uuid
    LIMIT 1
  `;

  const feedbackMap = new Map<string, string>();
  for (const fb of feedbackRows) {
    feedbackMap.set(String(fb.question_id), String(fb.feedback));
  }

  let questionTextMap = new Map<string, string>();
  if (env.CONTENTFUL_SPACE_ID && env.CONTENTFUL_ACCESS_TOKEN) {
    try {
      const { getContentful } = await import("./contentful.js");
      const client = getContentful();
      const entry = await client.getEntry(contentId, { include: 10 });
      
      const extractQuestionText = (value: unknown, collected: Map<string, string>, seen = new WeakSet<object>()): void => {
        if (Array.isArray(value)) {
          for (const item of value) {
            extractQuestionText(item, collected, seen);
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

        if (
          fields &&
          sys?.id &&
          (contentType === "question" || contentType === "questionMultipleChoice")
        ) {
          const text = fields.text || fields.question || fields.questionText;
          if (text && typeof text === "string") {
            collected.set(sys.id, text);
          }
          return;
        }

        for (const child of Object.values(fields ?? record)) {
          extractQuestionText(child, collected, seen);
        }
      };

      const rawFields = (entry.fields as unknown) as Record<string, unknown>;
      extractQuestionText(rawFields, questionTextMap);
    } catch (error) {
      console.error('[ERROR] Failed to fetch question text from Contentful:', error);
    }
  }

  const questions: AssessmentDetailQuestion[] = gradeRows.map((grade) => {
    const questionId = String(grade.question_id);
    const progressItem = progressItems[questionId];
    return {
      questionId,
      questionText: questionTextMap.get(questionId) ?? questionId,
      pointsAvailable: Number(grade.points_available),
      pointsEarned: Number(grade.points_earned),
      feedback: feedbackMap.get(questionId) ?? null,
      userAnswer: progressItem?.answer ?? null,
    };
  });

  const totalPointsEarned = questions.reduce((sum, q) => sum + q.pointsEarned, 0);
  const totalPointsAvailable = questions.reduce((sum, q) => sum + q.pointsAvailable, 0);

  return {
    assessmentId: String(row.id),
    enrollmentName,
    totalPointsEarned,
    totalPointsAvailable,
    questions,
    assessmentFeedback: overallFeedbackRows[0] ? String(overallFeedbackRows[0].feedback) : null,
    assessmentDate: toIso(row.completed_at as string | Date | null),
  };
}
