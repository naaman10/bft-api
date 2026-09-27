import { getDb } from "./db.js";
import { z } from "zod";

export const GameSessionSchema = z.object({
  gameType: z.enum(['maths-quiz', 'gem-hunt', 'word-search']),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(1),
  timeElapsed: z.number().int().min(0).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  gameData: z.record(z.string(), z.any()),
}).refine(
  (data) => data.score <= data.maxScore,
  "Score cannot be greater than max score"
);

export type GameSessionInput = z.infer<typeof GameSessionSchema>;

export type GameSession = {
  id: string;
  userId: string;
  gameType: string;
  score: number;
  maxScore: number;
  scorePercentage: number;
  timeElapsedSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
  gameData: Record<string, any>;
  createdAt: string;
  updatedAt: string;
};

export type GameSessionFilters = {
  gameType?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export class GameSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Game session not found: ${sessionId}`);
    this.name = "GameSessionNotFoundError";
  }
}

export class UnauthorizedAccessError extends Error {
  constructor() {
    super("Unauthorized to access this game session");
    this.name = "UnauthorizedAccessError";
  }
}

export async function createGameSession(
  userId: string,
  sessionData: GameSessionInput
): Promise<GameSession> {
  const sql = getDb();

  const result = await sql`
    INSERT INTO game_sessions (
      user_id,
      game_type,
      score,
      max_score,
      time_elapsed_seconds,
      started_at,
      completed_at,
      game_data
    ) VALUES (
      ${userId},
      ${sessionData.gameType},
      ${sessionData.score},
      ${sessionData.maxScore},
      ${sessionData.timeElapsed ?? null},
      ${sessionData.startedAt},
      ${sessionData.completedAt ?? null},
      ${JSON.stringify(sessionData.gameData)}
    )
    RETURNING
      id,
      user_id as "userId",
      game_type as "gameType",
      score,
      max_score as "maxScore",
      score_percentage as "scorePercentage",
      time_elapsed_seconds as "timeElapsedSeconds",
      started_at as "startedAt",
      completed_at as "completedAt",
      game_data as "gameData",
      created_at as "createdAt",
      updated_at as "updatedAt"
  `;

  if (result.length === 0) {
    throw new Error("Failed to create game session");
  }

  return result[0] as GameSession;
}

export async function getGameSessions(
  userId: string,
  filters: GameSessionFilters = {}
): Promise<GameSession[]> {
  const sql = getDb();
  const {
    gameType,
    startDate,
    endDate,
    limit = 20,
    offset = 0,
  } = filters;

  const conditions: string[] = ['user_id = $1'];
  const params: any[] = [userId];
  let paramIndex = 2;

  if (gameType) {
    conditions.push(`game_type = $${paramIndex}`);
    params.push(gameType);
    paramIndex++;
  }

  if (startDate) {
    conditions.push(`completed_at >= $${paramIndex}`);
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    conditions.push(`completed_at <= $${paramIndex}`);
    params.push(endDate);
    paramIndex++;
  }

  const whereClause = conditions.join(' AND ');
  
  const result = await sql`
    SELECT
      id,
      user_id as "userId",
      game_type as "gameType",
      score,
      max_score as "maxScore",
      score_percentage as "scorePercentage",
      time_elapsed_seconds as "timeElapsedSeconds",
      started_at as "startedAt",
      completed_at as "completedAt",
      game_data as "gameData",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM game_sessions
    WHERE user_id = ${userId}
      ${gameType ? sql`AND game_type = ${gameType}` : sql``}
      ${startDate ? sql`AND completed_at >= ${startDate}` : sql``}
      ${endDate ? sql`AND completed_at <= ${endDate}` : sql``}
    ORDER BY completed_at DESC NULLS LAST, created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return result as GameSession[];
}

export async function getGameSessionById(
  sessionId: string,
  userId: string
): Promise<GameSession> {
  const sql = getDb();

  const result = await sql`
    SELECT
      id,
      user_id as "userId",
      game_type as "gameType",
      score,
      max_score as "maxScore",
      score_percentage as "scorePercentage",
      time_elapsed_seconds as "timeElapsedSeconds",
      started_at as "startedAt",
      completed_at as "completedAt",
      game_data as "gameData",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM game_sessions
    WHERE id = ${sessionId}
  `;

  if (result.length === 0) {
    throw new GameSessionNotFoundError(sessionId);
  }

  const session = result[0] as GameSession;

  if (session.userId !== userId) {
    throw new UnauthorizedAccessError();
  }

  return session;
}
