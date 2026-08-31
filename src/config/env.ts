import "dotenv/config";
import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === undefined || value === null ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().optional()
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional()
);

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  NEON_AUTH_BASE_URL: z.string().url(),
  NEON_AUTH_JWKS_URL: optionalUrl,
  NEON_API_KEY: optionalString,
  NEON_PROJECT_ID: optionalString,
  NEON_BRANCH_ID: optionalString,
  LEARN_APP_URL: optionalUrl,
  ADMIN_API_KEY: optionalString,
  DATABASE_URL: optionalString,
  CONTENTFUL_SPACE_ID: optionalString,
  CONTENTFUL_ACCESS_TOKEN: optionalString,
  CONTENTFUL_ENVIRONMENT: z.string().default("master"),
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment variables:\n${details}`);
}

export const env = parsed.data;

export const frontendOrigins = env.FRONTEND_URL.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
