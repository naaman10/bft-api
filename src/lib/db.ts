import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "../config/env.js";

let sql: NeonQueryFunction<false, false> | undefined;

export function getDb(): NeonQueryFunction<false, false> {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!sql) {
    sql = neon(env.DATABASE_URL);
  }

  return sql;
}
