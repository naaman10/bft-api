import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env, frontendOrigins } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { learnRoutes } from "./routes/learn.js";
import { adminRoutes } from "./routes/admin.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { AppEnv } from "./types.js";

export const app = new Hono<AppEnv>();

app.use(logger());
app.use(
  secureHeaders({
    // This API is called from a separate frontend origin.
    crossOriginResourcePolicy: "cross-origin",
  })
);
app.use(
  cors({
    origin: frontendOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Admin-Api-Key"],
    maxAge: 86400,
  })
);

app.onError((error, c) => {
  console.error(error);
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : error.message;
  return c.json({ error: message }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.route("/health", healthRoutes);
app.route("/learn", learnRoutes);
app.route("/admin", adminRoutes);
app.route("/webhooks", webhookRoutes);
