import { createMiddleware } from "hono/factory";
import {
  getBearerToken,
  verifyAccessToken,
} from "../lib/auth.js";
import { getStudentByNeonUserId } from "../lib/students.js";
import type { AppEnv, SessionResponse } from "../types.js";

const unauthorized: SessionResponse = {
  authenticated: false,
  user: null,
  error: "Unauthorized",
};

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getBearerToken(c.req.header("Authorization"));

  if (!token) {
    return c.json(unauthorized, 401);
  }

  // Verify JWT token and get neon_user_id
  const user = await verifyAccessToken(token);

  if (!user) {
    return c.json(unauthorized, 401);
  }

  console.log('[Auth] Neon Auth user ID from token:', user.id);

  // Resolve neon_user_id to internal student ID
  const student = await getStudentByNeonUserId(user.id);

  if (!student) {
    console.error('[Auth] No student found for neon_user_id:', user.id);
    return c.json(
      {
        authenticated: false,
        user: null,
        error: "Student record not found",
      } as SessionResponse,
      401
    );
  }

  console.log('[Auth] Resolved to internal student ID:', student.id);

  c.set("user", user);
  c.set("student", student);
  await next();
});
