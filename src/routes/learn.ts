import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth.js";
import type { AppEnv, SessionResponse } from "../types.js";

export const learnRoutes = new Hono<AppEnv>();

learnRoutes.get("/user", requireAuth, (c) => {
  const body: SessionResponse = {
    authenticated: true,
    user: c.get("user"),
  };

  return c.json(body);
});
