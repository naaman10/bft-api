import { Hono } from "hono";
import { env } from "../config/env.js";
import type { AppEnv } from "../types.js";

export const healthRoutes = new Hono<AppEnv>();

healthRoutes.get("/", (c) =>
  c.json({
    status: "ok",
    service: "bft-api",
    environment: env.NODE_ENV,
  })
);
