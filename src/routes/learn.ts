import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.js";
import { listLearnEnrollmentsForNeonUser } from "../lib/enrollments.js";
import type { AppEnv, SessionResponse } from "../types.js";

export const learnRoutes = new Hono<AppEnv>();

learnRoutes.get("/user", requireAuth, async (c) => {
  const user = c.get("user");
  const enrollments = await listLearnEnrollmentsForNeonUser(user.id);
  const body: SessionResponse = {
    authenticated: true,
    user,
    enrollments,
  };

  return c.json(body);
});
