import { getDb } from "./db.js";
import { getStudentByNeonUserId, StudentNotFoundError } from "./students.js";

export type QuizQuestion = {
  id: string;
  questionText: string;
  yearGroup: string;
  subject: string;
  difficultyLevel: number;
};

export type GenerateQuizResult = {
  quizId: string;
  questions: QuizQuestion[];
};

export type ValidateAnswerResult = {
  correct: boolean;
  correctAnswer: string;
  explanation?: string;
};

export type QuizResponse = {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeTakenSeconds: number;
};

export type SubmitQuizData = {
  yearGroup: string;
  subject: string | null;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  timeTakenSeconds: number;
  startedAt: string;
  responses: QuizResponse[];
};

export type SubmitQuizResult = {
  id: string;
  scorePercentage: number;
  message: string;
};

export type QuizHistoryItem = {
  id: string;
  gameType: string;
  yearGroup: string;
  subject: string | null;
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  timeTakenSeconds: number;
  completedAt: string;
};

export type QuizAnalytics = {
  totalQuizzes: number;
  avgScorePercentage: number;
  bestScore: number;
  worstScore: number;
  totalQuestionsAttempted: number;
  totalCorrect: number;
  totalIncorrect: number;
  avgTimeSeconds: number;
  lastQuizDate: string | null;
};

/**
 * Get all available year groups from database
 */
export async function getYearGroups(): Promise<string[]> {
  const sql = getDb();
  
  const rows = await sql`
    SELECT * FROM get_available_year_groups() ORDER BY year_group
  `;
  
  return rows.map((row) => String(row.year_group));
}

/**
 * Get available subjects for a year group
 */
export async function getSubjects(yearGroup: string): Promise<string[]> {
  const sql = getDb();
  
  const rows = await sql`
    SELECT * FROM get_available_subjects(${yearGroup}) ORDER BY subject
  `;
  
  return rows.map((row) => String(row.subject));
}

/**
 * Generate random quiz questions
 */
export async function generateQuiz(
  yearGroup: string,
  subject: string | null | undefined,
  questionCount: number
): Promise<GenerateQuizResult> {
  const sql = getDb();
  
  const rows = await sql`
    SELECT * FROM get_random_questions(
      ${yearGroup},
      ${subject || null},
      ${questionCount},
      NULL
    )
  `;

  if (rows.length === 0) {
    throw new Error("No questions found for the selected criteria");
  }

  // Map database columns to camelCase for frontend
  const questions: QuizQuestion[] = rows.map((row) => ({
    id: String(row.id),
    questionText: String(row.question_text),
    yearGroup: String(row.year_group),
    subject: String(row.subject),
    difficultyLevel: Number(row.difficulty_level),
  }));

  // Generate temporary quiz ID using timestamp and random string
  const quizId = `temp-quiz-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return { quizId, questions };
}

/**
 * Validate an answer for a question
 */
export async function validateAnswer(
  questionId: string,
  userAnswer: string
): Promise<ValidateAnswerResult> {
  const sql = getDb();
  
  const rows = await sql`
    SELECT correct_answer, alternative_answers, explanation 
    FROM questions 
    WHERE id = ${questionId}::uuid AND active = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error("Question not found");
  }

  const question = rows[0];
  if (!question) {
    throw new Error("Question not found");
  }

  const normalizedUserAnswer = userAnswer.trim().toLowerCase();
  const normalizedCorrectAnswer = String(question.correct_answer).toLowerCase();

  // Check if answer matches correct answer
  let isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;

  // Check alternative answers if not correct yet
  if (!isCorrect && question.alternative_answers) {
    const alternatives = question.alternative_answers as string[];
    isCorrect = alternatives
      .map((alt: string) => alt.toLowerCase())
      .includes(normalizedUserAnswer);
  }

  return {
    correct: isCorrect,
    correctAnswer: String(question.correct_answer),
    explanation: question.explanation ? String(question.explanation) : undefined,
  };
}

/**
 * Submit and save quiz results
 */
export async function submitQuizResults(
  neonUserId: string,
  quizData: SubmitQuizData
): Promise<SubmitQuizResult> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();

  const scorePercentage = (quizData.correctAnswers / quizData.totalQuestions) * 100;

  // Insert quiz result and get the ID
  const resultRows = await sql`
    INSERT INTO quiz_results (
      student_id, game_type, year_group, subject,
      total_questions, correct_answers, incorrect_answers,
      score_percentage, time_taken_seconds, started_at
    ) VALUES (
      ${student.id}::uuid,
      'quiz_generator',
      ${quizData.yearGroup},
      ${quizData.subject},
      ${quizData.totalQuestions},
      ${quizData.correctAnswers},
      ${quizData.incorrectAnswers},
      ${scorePercentage},
      ${quizData.timeTakenSeconds},
      ${quizData.startedAt}
    )
    RETURNING id
  `;

  const quizResultId = String(resultRows[0]?.id);

  if (!quizResultId) {
    throw new Error("Failed to create quiz result");
  }

  // Insert individual question responses
  for (const response of quizData.responses) {
    await sql`
      INSERT INTO quiz_question_responses (
        quiz_result_id, question_id, user_answer, 
        is_correct, time_taken_seconds
      ) VALUES (
        ${quizResultId}::uuid,
        ${response.questionId}::uuid,
        ${response.userAnswer},
        ${response.isCorrect},
        ${response.timeTakenSeconds}
      )
    `;
  }

  return {
    id: quizResultId,
    scorePercentage: parseFloat(scorePercentage.toFixed(2)),
    message: "Quiz results saved successfully",
  };
}

/**
 * Get quiz history for a student
 */
export async function getQuizHistory(
  neonUserId: string,
  limit: number,
  gameType: string
): Promise<QuizHistoryItem[]> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();
  
  const rows = await sql`
    SELECT 
      id, game_type, year_group, subject,
      total_questions, correct_answers, score_percentage,
      time_taken_seconds, completed_at
    FROM quiz_results
    WHERE student_id = ${student.id}::uuid AND game_type = ${gameType}
    ORDER BY completed_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    gameType: String(row.game_type),
    yearGroup: String(row.year_group),
    subject: row.subject ? String(row.subject) : null,
    totalQuestions: Number(row.total_questions),
    correctAnswers: Number(row.correct_answers),
    scorePercentage: parseFloat(String(row.score_percentage)),
    timeTakenSeconds: Number(row.time_taken_seconds),
    completedAt: row.completed_at instanceof Date 
      ? row.completed_at.toISOString() 
      : String(row.completed_at),
  }));
}

/**
 * Get performance analytics for a student
 */
export async function getAnalytics(
  neonUserId: string,
  yearGroup?: string,
  subject?: string
): Promise<QuizAnalytics> {
  const student = await getStudentByNeonUserId(neonUserId);

  if (!student) {
    throw new StudentNotFoundError();
  }

  const sql = getDb();
  
  // Build the query dynamically based on filters
  let query = sql`
    SELECT 
      COUNT(*) as total_quizzes,
      AVG(score_percentage) as avg_score,
      MAX(score_percentage) as best_score,
      MIN(score_percentage) as worst_score,
      SUM(total_questions) as total_questions,
      SUM(correct_answers) as total_correct,
      SUM(incorrect_answers) as total_incorrect,
      AVG(time_taken_seconds) as avg_time,
      MAX(completed_at) as last_quiz_date
    FROM quiz_results
    WHERE student_id = ${student.id}::uuid 
      AND game_type = 'quiz_generator'
  `;

  // Note: Neon's SQL template doesn't support dynamic WHERE conditions easily
  // So we'll fetch all and filter, or use a different approach
  // For now, let's use a more flexible approach
  
  const baseConditions = [
    sql`student_id = ${student.id}::uuid`,
    sql`game_type = 'quiz_generator'`,
  ];
  
  let rows;
  
  if (yearGroup && subject) {
    rows = await sql`
      SELECT 
        COUNT(*) as total_quizzes,
        AVG(score_percentage) as avg_score,
        MAX(score_percentage) as best_score,
        MIN(score_percentage) as worst_score,
        SUM(total_questions) as total_questions,
        SUM(correct_answers) as total_correct,
        SUM(incorrect_answers) as total_incorrect,
        AVG(time_taken_seconds) as avg_time,
        MAX(completed_at) as last_quiz_date
      FROM quiz_results
      WHERE student_id = ${student.id}::uuid 
        AND game_type = 'quiz_generator'
        AND year_group = ${yearGroup}
        AND subject = ${subject}
    `;
  } else if (yearGroup) {
    rows = await sql`
      SELECT 
        COUNT(*) as total_quizzes,
        AVG(score_percentage) as avg_score,
        MAX(score_percentage) as best_score,
        MIN(score_percentage) as worst_score,
        SUM(total_questions) as total_questions,
        SUM(correct_answers) as total_correct,
        SUM(incorrect_answers) as total_incorrect,
        AVG(time_taken_seconds) as avg_time,
        MAX(completed_at) as last_quiz_date
      FROM quiz_results
      WHERE student_id = ${student.id}::uuid 
        AND game_type = 'quiz_generator'
        AND year_group = ${yearGroup}
    `;
  } else {
    rows = await sql`
      SELECT 
        COUNT(*) as total_quizzes,
        AVG(score_percentage) as avg_score,
        MAX(score_percentage) as best_score,
        MIN(score_percentage) as worst_score,
        SUM(total_questions) as total_questions,
        SUM(correct_answers) as total_correct,
        SUM(incorrect_answers) as total_incorrect,
        AVG(time_taken_seconds) as avg_time,
        MAX(completed_at) as last_quiz_date
      FROM quiz_results
      WHERE student_id = ${student.id}::uuid 
        AND game_type = 'quiz_generator'
    `;
  }

  const data = rows[0];

  if (!data || rows.length === 0 || Number(data.total_quizzes) === 0) {
    return {
      totalQuizzes: 0,
      avgScorePercentage: 0,
      bestScore: 0,
      worstScore: 0,
      totalQuestionsAttempted: 0,
      totalCorrect: 0,
      totalIncorrect: 0,
      avgTimeSeconds: 0,
      lastQuizDate: null,
    };
  }

  return {
    totalQuizzes: Number(data.total_quizzes) || 0,
    avgScorePercentage: data.avg_score ? parseFloat(Number(data.avg_score).toFixed(2)) : 0,
    bestScore: data.best_score ? parseFloat(String(data.best_score)) : 0,
    worstScore: data.worst_score ? parseFloat(String(data.worst_score)) : 0,
    totalQuestionsAttempted: Number(data.total_questions) || 0,
    totalCorrect: Number(data.total_correct) || 0,
    totalIncorrect: Number(data.total_incorrect) || 0,
    avgTimeSeconds: data.avg_time ? Math.round(Number(data.avg_time)) : 0,
    lastQuizDate: data.last_quiz_date 
      ? (data.last_quiz_date instanceof Date 
          ? data.last_quiz_date.toISOString() 
          : String(data.last_quiz_date))
      : null,
  };
}
