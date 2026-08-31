import { createMiddleware } from "hono/factory";
import {
  getBearerToken,
  verifyAccessToken,
} from "../lib/auth.js";
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

  const user = await verifyAccessToken(token);

  if (!user) {
    return c.json(unauthorized, 401);
  }

  c.set("user", user);
  await next();
});
