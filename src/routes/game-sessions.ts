import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createGameSession,
  getGameSessions,
  getGameSessionById,
  GameSessionSchema,
  GameSessionNotFoundError,
  UnauthorizedAccessError,
  type GameSessionFilters,
} from "../lib/game-sessions.js";
import type { AppEnv } from "../types.js";

const gameSessionRoutes = new Hono<AppEnv>();

/**
 * POST /api/games/sessions
 * Create a new game session
 * Requires authentication
 */
gameSessionRoutes.post("/sessions", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();

    // Validate request body
    const validation = GameSessionSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        400
      );
    }

    const sessionData = validation.data;

    // Create game session
    const session = await createGameSession(user.id, sessionData);

    return c.json(session, 201);
  } catch (error) {
    console.error("Error creating game session:", error);

    if (error instanceof Error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ error: "Failed to create game session" }, 500);
  }
});

/**
 * GET /api/games/sessions
 * Get game sessions for the authenticated user
 * Query parameters:
 *   - gameType: Filter by game type (optional)
 *   - limit: Number of sessions to return (default: 20, max: 100)
 *   - offset: Pagination offset (default: 0)
 *   - startDate: Filter sessions after this date (ISO 8601)
 *   - endDate: Filter sessions before this date (ISO 8601)
 */
gameSessionRoutes.get("/sessions", requireAuth, async (c) => {
  try {
    const user = c.get("user");

    // Parse query parameters
    const gameType = c.req.query("gameType");
    const limitStr = c.req.query("limit");
    const offsetStr = c.req.query("offset");
    const startDate = c.req.query("startDate");
    const endDate = c.req.query("endDate");

    // Validate limit
    let limit = 20;
    if (limitStr) {
      const parsedLimit = parseInt(limitStr);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return c.json({ error: "Limit must be between 1 and 100" }, 400);
      }
      limit = parsedLimit;
    }

    // Validate offset
    let offset = 0;
    if (offsetStr) {
      const parsedOffset = parseInt(offsetStr);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return c.json({ error: "Offset must be a non-negative integer" }, 400);
      }
      offset = parsedOffset;
    }

    // Validate game type
    if (gameType && !['maths-quiz', 'gem-hunt', 'word-search'].includes(gameType)) {
      return c.json(
        { error: "Invalid game type. Must be one of: maths-quiz, gem-hunt, word-search" },
        400
      );
    }

    // Build filters
    const filters: GameSessionFilters = {
      gameType,
      startDate,
      endDate,
      limit,
      offset,
    };

    // Get sessions
    const sessions = await getGameSessions(user.id, filters);

    return c.json({ sessions });
  } catch (error) {
    console.error("Error fetching game sessions:", error);

    if (error instanceof Error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ error: "Failed to fetch game sessions" }, 500);
  }
});

/**
 * GET /api/games/sessions/:id
 * Get a specific game session by ID
 * Requires authentication and ownership of the session
 */
gameSessionRoutes.get("/sessions/:id", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    const sessionId = c.req.param("id");

    if (!sessionId) {
      return c.json({ error: "Session ID is required" }, 400);
    }

    const session = await getGameSessionById(sessionId, user.id);

    return c.json(session);
  } catch (error) {
    console.error("Error fetching game session:", error);

    if (error instanceof GameSessionNotFoundError) {
      return c.json({ error: "Game session not found" }, 404);
    }

    if (error instanceof UnauthorizedAccessError) {
      return c.json({ error: "Unauthorized to access this game session" }, 403);
    }

    if (error instanceof Error) {
      return c.json({ error: error.message }, 500);
    }

    return c.json({ error: "Failed to fetch game session" }, 500);
  }
});

export { gameSessionRoutes };
