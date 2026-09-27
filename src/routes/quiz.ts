import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.js";
import {
  getYearGroups,
  getSubjects,
  generateQuiz,
  validateAnswer,
  submitQuizResults,
  getQuizHistory,
  getAnalytics,
  type SubmitQuizData,
} from "../lib/quiz.js";
import { StudentNotFoundError } from "../lib/students.js";
import type { AppEnv } from "../types.js";

const quizRoutes = new Hono<AppEnv>();

/**
 * GET /quiz/year-groups
 * Get all available year groups
 * Public endpoint
 */
quizRoutes.get("/year-groups", async (c) => {
  try {
    const yearGroups = await getYearGroups();
    return c.json({ yearGroups });
  } catch (error) {
    console.error("Error fetching year groups:", error);
    return c.json({ error: "Failed to fetch year groups" }, 500);
  }
});

/**
 * GET /quiz/subjects?yearGroup=Year+6
 * Get subjects for a year group
 * Public endpoint
 */
quizRoutes.get("/subjects", async (c) => {
  try {
    const yearGroup = c.req.query("yearGroup");

    if (!yearGroup) {
      return c.json({ error: "Year group is required" }, 400);
    }

    const subjects = await getSubjects(yearGroup);
    return c.json({ subjects });
  } catch (error) {
    console.error("Error fetching subjects:", error);
    return c.json({ error: "Failed to fetch subjects" }, 500);
  }
});

/**
 * POST /quiz/generate
 * Generate quiz questions
 * Public endpoint
 */
quizRoutes.post("/generate", async (c) => {
  try {
    const body = await c.req.json();
    const { yearGroup, subject, questionCount } = body;

    // Validation
    if (!yearGroup) {
      return c.json({ error: "Year group is required" }, 400);
    }

    if (!questionCount || questionCount < 5 || questionCount > 20) {
      return c.json({ error: "Question count must be between 5 and 20" }, 400);
    }

    const result = await generateQuiz(yearGroup, subject, questionCount);
    return c.json(result);
  } catch (error) {
    console.error("Error generating quiz:", error);

    if (error instanceof Error && error.message.includes("No questions found")) {
      return c.json({ error: error.message }, 404);
    }

    return c.json({ error: "Failed to generate quiz" }, 500);
  }
});

/**
 * POST /quiz/validate-answer
 * Validate a quiz answer
 * Public endpoint
 */
quizRoutes.post("/validate-answer", async (c) => {
  try {
    const body = await c.req.json();
    const { questionId, answer } = body;

    if (!questionId || answer === undefined || answer === null) {
      return c.json({ error: "Question ID and answer are required" }, 400);
    }

    const result = await validateAnswer(questionId, String(answer));
    return c.json(result);
  } catch (error) {
    console.error("Error validating answer:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json({ error: "Question not found" }, 404);
    }

    return c.json({ error: "Failed to validate answer" }, 500);
  }
});

/**
 * POST /quiz/submit
 * Submit quiz results (requires authentication)
 * Private endpoint
 */
quizRoutes.post("/submit", requireAuth, async (c) => {
  try {
    const student = c.get("student");
    const body = await c.req.json();
    const quizData = body as SubmitQuizData;

    // Validation
    if (!quizData.yearGroup || quizData.totalQuestions < 1) {
      return c.json({ error: "Invalid quiz data" }, 400);
    }

    if (!quizData.responses || !Array.isArray(quizData.responses)) {
      return c.json({ error: "Quiz responses are required" }, 400);
    }

    const result = await submitQuizResults(student.id, quizData);
    return c.json(result);
  } catch (error) {
    console.error("Error submitting quiz results:", error);

    if (error instanceof StudentNotFoundError) {
      return c.json({ error: "Student not found" }, 404);
    }

    return c.json({ error: "Failed to submit quiz results" }, 500);
  }
});

/**
 * GET /quiz/history?limit=20&gameType=quiz_generator
 * Get quiz history for authenticated student
 * Private endpoint
 */
quizRoutes.get("/history", requireAuth, async (c) => {
  try {
    const student = c.get("student");
    const limitStr = c.req.query("limit");
    const gameType = c.req.query("gameType") || "quiz_generator";

    const limit = limitStr ? parseInt(limitStr) : 20;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return c.json({ error: "Limit must be between 1 and 100" }, 400);
    }

    const results = await getQuizHistory(student.id, limit, gameType);
    return c.json({ results });
  } catch (error) {
    console.error("Error fetching quiz history:", error);

    if (error instanceof StudentNotFoundError) {
      return c.json({ error: "Student not found" }, 404);
    }

    return c.json({ error: "Failed to fetch quiz history" }, 500);
  }
});

/**
 * GET /quiz/analytics?yearGroup=Year+6&subject=Percentages
 * Get performance analytics for authenticated student
 * Private endpoint
 */
quizRoutes.get("/analytics", requireAuth, async (c) => {
  try {
    const student = c.get("student");
    const yearGroup = c.req.query("yearGroup");
    const subject = c.req.query("subject");

    const analytics = await getAnalytics(student.id, yearGroup, subject);
    return c.json(analytics);
  } catch (error) {
    console.error("Error fetching analytics:", error);

    if (error instanceof StudentNotFoundError) {
      return c.json({ error: "Student not found" }, 404);
    }

    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

export { quizRoutes };
