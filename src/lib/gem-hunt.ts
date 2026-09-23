import { getDb } from "./db.js";
import { getStudentByNeonUserId, StudentNotFoundError } from "./students.js";

export type GemHuntSession = {
  id: string;
  studentId: string;
  yearGroup: string;
  subject: string;
  currentLevel: number;
  totalGems: number;
  livesRemaining: number;
  movesRemaining: number;
  startedAt: string;
  lastPlayedAt: string;
  completed: boolean;
  completedAt: string | null;
};

export type GemHuntQuestion = {
  id: string;
  questionText: string;
  yearGroup: string;
  subject: string;
  difficultyLevel: number;
};

export type AnswerValidation = {
  correct: boolean;
  correctAnswer: string;
  movesEarned: number;
};

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return asIso(value);
}

function mapSessionRow(row: Record<string, unknown>): GemHuntSession {
  return {
    id: String(row.id),
    studentId: String(row.studentId),
    yearGroup: String(row.yearGroup),
    subject: String(row.subject),
    currentLevel: Number(row.currentLevel),
    totalGems: Number(row.totalGems),
    livesRemaining: Number(row.livesRemaining),
    movesRemaining: Number(row.movesRemaining),
    startedAt: asIso(row.startedAt),
    lastPlayedAt: asIso(row.lastPlayedAt),
    completed: Boolean(row.completed),
    completedAt: asIsoOrNull(row.completedAt),
  };
}

/**
 * Create a new Gem Hunt game session
 */
export async function createGemHuntSession(
  neonUserId: string,
  yearGroup: string,
  subject: string
): Promise<GemHuntSession> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();
  const rows = await sql`
    INSERT INTO gem_hunt_sessions (student_id, year_group, subject)
    VALUES (${student.id}::uuid, ${yearGroup}, ${subject})
    RETURNING 
      id,
      student_id as "studentId",
      year_group as "yearGroup",
      subject,
      current_level as "currentLevel",
      total_gems as "totalGems",
      lives_remaining as "livesRemaining",
      moves_remaining as "movesRemaining",
      started_at as "startedAt",
      last_played_at as "lastPlayedAt",
      completed,
      completed_at as "completedAt"
  `;

  const session = rows[0];
  if (!session) {
    throw new Error("Failed to create session");
  }

  return mapSessionRow(session as Record<string, unknown>);
}

/**
 * Get an existing session by ID
 */
export async function getGemHuntSession(
  neonUserId: string,
  sessionId: string
): Promise<GemHuntSession | null> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();
  const rows = await sql`
    SELECT 
      id,
      student_id as "studentId",
      year_group as "yearGroup",
      subject,
      current_level as "currentLevel",
      total_gems as "totalGems",
      lives_remaining as "livesRemaining",
      moves_remaining as "movesRemaining",
      started_at as "startedAt",
      last_played_at as "lastPlayedAt",
      completed,
      completed_at as "completedAt"
    FROM gem_hunt_sessions
    WHERE id = ${sessionId}::uuid
      AND student_id = ${student.id}::uuid
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  const session = rows[0];
  if (!session) {
    return null;
  }

  return mapSessionRow(session as Record<string, unknown>);
}

/**
 * Get random questions for a year group and subject
 */
export async function getRandomQuestions(
  yearGroup: string,
  subject: string,
  count: number = 5,
  difficulty?: number
): Promise<GemHuntQuestion[]> {
  const sql = getDb();
  
  const rows = await sql`
    SELECT 
      id,
      question_text as "questionText",
      year_group as "yearGroup",
      subject,
      difficulty_level as "difficultyLevel"
    FROM gem_hunt_questions
    WHERE year_group = ${yearGroup}
      AND subject = ${subject}
      AND active = TRUE
      AND (${difficulty}::int IS NULL OR difficulty_level = ${difficulty}::int)
    ORDER BY RANDOM()
    LIMIT ${count}
  `;

  return rows.map(row => ({
    id: String(row.id),
    questionText: String(row.questionText),
    yearGroup: String(row.yearGroup),
    subject: String(row.subject),
    difficultyLevel: Number(row.difficultyLevel),
  }));
}

/**
 * Validate a student's answer to a question
 */
export async function validateAnswer(
  sessionId: string,
  questionId: string,
  userAnswer: string
): Promise<AnswerValidation> {
  const sql = getDb();

  // Get the correct answer
  const questionRows = await sql`
    SELECT correct_answer, alternative_answers
    FROM gem_hunt_questions
    WHERE id = ${questionId}::uuid
    LIMIT 1
  `;

  if (questionRows.length === 0) {
    throw new Error("Question not found");
  }

  const question = questionRows[0];
  if (!question) {
    throw new Error("Question not found");
  }

  const normalizedAnswer = userAnswer.trim().toLowerCase();
  const correctAnswer = String(question.correct_answer).trim().toLowerCase();

  let isCorrect = false;

  // Check main answer
  if (normalizedAnswer === correctAnswer) {
    isCorrect = true;
  }

  // Check alternative answers if available
  if (!isCorrect && question.alternative_answers) {
    const alternatives = question.alternative_answers as string[];
    if (alternatives.some((alt) => alt.trim().toLowerCase() === normalizedAnswer)) {
      isCorrect = true;
    }
  }

  // Record the response
  await sql`
    INSERT INTO gem_hunt_question_responses (
      session_id,
      question_id,
      user_answer,
      is_correct
    )
    VALUES (
      ${sessionId}::uuid,
      ${questionId}::uuid,
      ${userAnswer},
      ${isCorrect}
    )
  `;

  // Return validation result
  return {
    correct: isCorrect,
    correctAnswer: String(question.correct_answer),
    movesEarned: isCorrect ? 5 : 0,
  };
}

/**
 * Update session progress
 */
export async function updateSessionProgress(
  neonUserId: string,
  sessionId: string,
  updates: {
    currentLevel?: number;
    totalGems?: number;
    livesRemaining?: number;
    movesRemaining?: number;
    completed?: boolean;
  }
): Promise<GemHuntSession> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();
  
  const updateFields: string[] = [];
  const values: any[] = [];

  if (updates.currentLevel !== undefined) {
    updateFields.push(`current_level = $${updateFields.length + 1}`);
    values.push(updates.currentLevel);
  }
  if (updates.totalGems !== undefined) {
    updateFields.push(`total_gems = $${updateFields.length + 1}`);
    values.push(updates.totalGems);
  }
  if (updates.livesRemaining !== undefined) {
    updateFields.push(`lives_remaining = $${updateFields.length + 1}`);
    values.push(updates.livesRemaining);
  }
  if (updates.movesRemaining !== undefined) {
    updateFields.push(`moves_remaining = $${updateFields.length + 1}`);
    values.push(updates.movesRemaining);
  }
  if (updates.completed !== undefined) {
    updateFields.push(`completed = $${updateFields.length + 1}`);
    values.push(updates.completed);
    if (updates.completed) {
      updateFields.push(`completed_at = NOW()`);
    }
  }

  updateFields.push(`last_played_at = NOW()`);

  const rows = await sql`
    UPDATE gem_hunt_sessions
    SET
      current_level = COALESCE(${updates.currentLevel}::int, current_level),
      total_gems = COALESCE(${updates.totalGems}::int, total_gems),
      lives_remaining = COALESCE(${updates.livesRemaining}::int, lives_remaining),
      moves_remaining = COALESCE(${updates.movesRemaining}::int, moves_remaining),
      completed = COALESCE(${updates.completed}::boolean, completed),
      completed_at = CASE WHEN ${updates.completed}::boolean THEN NOW() ELSE completed_at END,
      last_played_at = NOW()
    WHERE id = ${sessionId}::uuid
      AND student_id = ${student.id}::uuid
    RETURNING 
      id,
      student_id as "studentId",
      year_group as "yearGroup",
      subject,
      current_level as "currentLevel",
      total_gems as "totalGems",
      lives_remaining as "livesRemaining",
      moves_remaining as "movesRemaining",
      started_at as "startedAt",
      last_played_at as "lastPlayedAt",
      completed,
      completed_at as "completedAt"
  `;

  if (rows.length === 0) {
    throw new Error("Session not found or unauthorized");
  }

  const session = rows[0];
  if (!session) {
    throw new Error("Session not found or unauthorized");
  }

  return mapSessionRow(session as Record<string, unknown>);
}

/**
 * Get leaderboard for a year group and subject
 */
export async function getLeaderboard(
  yearGroup: string,
  subject: string,
  limit: number = 100
) {
  const sql = getDb();

  const rows = await sql`
    SELECT 
      l.student_id as "studentId",
      s.name as "studentName",
      l.total_gems as "totalGems",
      l.highest_level as "highestLevel",
      l.total_games_played as "totalGamesPlayed",
      l.average_accuracy as "averageAccuracy",
      RANK() OVER (ORDER BY l.total_gems DESC) as rank
    FROM gem_hunt_leaderboard l
    JOIN students s ON l.student_id = s.id
    WHERE l.year_group = ${yearGroup}
      AND l.subject = ${subject}
    ORDER BY l.total_gems DESC
    LIMIT ${limit}
  `;

  return rows;
}

/**
 * Save level completion and update leaderboard
 */
export async function saveLevelCompletion(
  neonUserId: string,
  sessionId: string,
  levelNumber: number,
  gemsCollected: number,
  timeTakenSeconds: number,
  questionsAnswered: number,
  questionsCorrect: number
) {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  // Get session details
  const session = await getGemHuntSession(neonUserId, sessionId);
  
  if (!session) {
    throw new Error("Session not found");
  }

  const sql = getDb();

  // Save level progress
  await sql`
    INSERT INTO gem_hunt_level_progress (
      student_id,
      session_id,
      year_group,
      subject,
      level_number,
      gems_collected,
      questions_answered,
      questions_correct,
      time_taken_seconds,
      completed
    )
    VALUES (
      ${student.id}::uuid,
      ${sessionId}::uuid,
      ${session.yearGroup},
      ${session.subject},
      ${levelNumber},
      ${gemsCollected},
      ${questionsAnswered},
      ${questionsCorrect},
      ${timeTakenSeconds},
      TRUE
    )
    ON CONFLICT (student_id, year_group, subject, level_number, session_id)
    DO UPDATE SET
      gems_collected = ${gemsCollected},
      questions_answered = ${questionsAnswered},
      questions_correct = ${questionsCorrect},
      time_taken_seconds = ${timeTakenSeconds},
      completed = TRUE,
      completed_at = NOW()
  `;

  // Update leaderboard
  const accuracy = questionsAnswered > 0 
    ? (questionsCorrect / questionsAnswered) * 100 
    : 0;

  await sql`
    SELECT update_gem_hunt_leaderboard_entry(
      ${student.id}::uuid,
      ${session.yearGroup},
      ${session.subject},
      ${gemsCollected},
      ${levelNumber},
      ${timeTakenSeconds},
      ${accuracy}::decimal
    )
  `;

  return { success: true };
}
