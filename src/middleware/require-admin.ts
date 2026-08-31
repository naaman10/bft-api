import { timingSafeEqual } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { env } from "../config/env.js";
import type { AppEnv } from "../types.js";

function keysMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!env.ADMIN_API_KEY) {
    return c.json({ error: "Admin API is not configured." }, 503);
  }

  const provided = c.req.header("X-Admin-Api-Key");

  if (!provided || !keysMatch(provided, env.ADMIN_API_KEY)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
