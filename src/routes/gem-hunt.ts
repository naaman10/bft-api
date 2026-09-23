import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createGemHuntSession,
  getGemHuntSession,
  getRandomQuestions,
  validateAnswer,
  updateSessionProgress,
  getLeaderboard,
  saveLevelCompletion,
} from "../lib/gem-hunt.js";
import type { AppEnv } from "../types.js";

const gemHunt = new Hono<AppEnv>();

gemHunt.use("*", requireAuth);

/**
 * POST /gem-hunt/sessions
 * Create a new game session
 */
gemHunt.post("/sessions", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const { yearGroup, subject } = body;

    if (!yearGroup || !subject) {
      return c.json({ error: "yearGroup and subject are required" }, 400);
    }

    const session = await createGemHuntSession(user.id, yearGroup, subject);
    return c.json(session, 201);
  } catch (error) {
    console.error("Error creating Gem Hunt session:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json({ error: "Student not found" }, 404);
    }

    return c.json({ error: "Failed to create session" }, 500);
  }
});

/**
 * GET /gem-hunt/sessions/:id
 * Get session details
 */
gemHunt.get("/sessions/:id", async (c) => {
  try {
    const user = c.get("user");
    const sessionId = c.req.param("id");
    const session = await getGemHuntSession(user.id, sessionId);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(session);
  } catch (error) {
    console.error("Error fetching Gem Hunt session:", error);
    return c.json({ error: "Failed to fetch session" }, 500);
  }
});

/**
 * PATCH /gem-hunt/sessions/:id
 * Update session progress
 */
gemHunt.patch("/sessions/:id", async (c) => {
  try {
    const user = c.get("user");
    const sessionId = c.req.param("id");
    const updates = await c.req.json();
    const session = await updateSessionProgress(user.id, sessionId, updates);
    return c.json(session);
  } catch (error) {
    console.error("Error updating Gem Hunt session:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json({ error: "Session not found or unauthorized" }, 404);
    }

    return c.json({ error: "Failed to update session" }, 500);
  }
});

/**
 * GET /gem-hunt/questions
 * Get random questions for a year group and subject
 */
gemHunt.get("/questions", async (c) => {
  try {
    const yearGroup = c.req.query("yearGroup");
    const subject = c.req.query("subject");
    const countStr = c.req.query("count");
    const difficultyStr = c.req.query("difficulty");

    if (!yearGroup || !subject) {
      return c.json(
        { error: "yearGroup and subject query parameters are required" },
        400
      );
    }

    const count = countStr ? parseInt(countStr) : 5;
    const difficulty = difficultyStr ? parseInt(difficultyStr) : undefined;

    if (isNaN(count) || count < 1 || count > 20) {
      return c.json({ error: "count must be between 1 and 20" }, 400);
    }

    if (
      difficulty !== undefined &&
      (isNaN(difficulty) || difficulty < 1 || difficulty > 3)
    ) {
      return c.json({ error: "difficulty must be 1, 2, or 3" }, 400);
    }

    const questions = await getRandomQuestions(
      yearGroup,
      subject,
      count,
      difficulty
    );

    return c.json({ questions });
  } catch (error) {
    console.error("Error fetching Gem Hunt questions:", error);
    return c.json({ error: "Failed to fetch questions" }, 500);
  }
});

/**
 * POST /gem-hunt/questions/validate
 * Validate a student's answer
 */
gemHunt.post("/questions/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { sessionId, questionId, answer } = body;

    if (!sessionId || !questionId || answer === undefined) {
      return c.json(
        { error: "sessionId, questionId, and answer are required" },
        400
      );
    }

    const result = await validateAnswer(sessionId, questionId, answer);
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
 * POST /gem-hunt/levels/complete
 * Save level completion
 */
gemHunt.post("/levels/complete", async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const {
      sessionId,
      levelNumber,
      gemsCollected,
      timeTakenSeconds,
      questionsAnswered,
      questionsCorrect,
    } = body;

    if (
      !sessionId ||
      levelNumber === undefined ||
      gemsCollected === undefined ||
      timeTakenSeconds === undefined ||
      questionsAnswered === undefined ||
      questionsCorrect === undefined
    ) {
      return c.json(
        {
          error:
            "sessionId, levelNumber, gemsCollected, timeTakenSeconds, questionsAnswered, and questionsCorrect are required",
        },
        400
      );
    }

    const result = await saveLevelCompletion(
      user.id,
      sessionId,
      levelNumber,
      gemsCollected,
      timeTakenSeconds,
      questionsAnswered,
      questionsCorrect
    );

    return c.json(result);
  } catch (error) {
    console.error("Error saving level completion:", error);

    if (error instanceof Error && error.message.includes("not found")) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ error: "Failed to save level completion" }, 500);
  }
});

/**
 * GET /gem-hunt/leaderboard
 * Get leaderboard rankings
 */
gemHunt.get("/leaderboard", async (c) => {
  try {
    const yearGroup = c.req.query("yearGroup");
    const subject = c.req.query("subject");
    const limitStr = c.req.query("limit");

    if (!yearGroup || !subject) {
      return c.json(
        { error: "yearGroup and subject query parameters are required" },
        400
      );
    }

    const limit = limitStr ? parseInt(limitStr) : 100;

    if (isNaN(limit) || limit < 1 || limit > 1000) {
      return c.json({ error: "limit must be between 1 and 1000" }, 400);
    }

    const leaderboard = await getLeaderboard(yearGroup, subject, limit);

    return c.json({
      yearGroup,
      subject,
      entries: leaderboard,
      total: leaderboard.length,
    });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return c.json({ error: "Failed to fetch leaderboard" }, 500);
  }
});

export { gemHunt };
