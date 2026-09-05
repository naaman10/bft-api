import { z } from "zod";

export const PROGRESS_SCHEMA_VERSION = 1 as const;

export const progressItemSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
  answer: z.unknown().optional(),
  score: z.number().optional(),
  attempts: z.number().int().nonnegative().optional(),
  completedAt: z.string().optional(),
  updatedAt: z.string(),
});

export const enrollmentProgressSchema = z.object({
  version: z.literal(PROGRESS_SCHEMA_VERSION).default(PROGRESS_SCHEMA_VERSION),
  currentItemId: z.string().min(1).optional(),
  items: z.record(z.string(), progressItemSchema).default({}),
});

export type ProgressItem = z.infer<typeof progressItemSchema>;
export type EnrollmentProgress = z.infer<typeof enrollmentProgressSchema>;

export function emptyProgress(): EnrollmentProgress {
  return { version: PROGRESS_SCHEMA_VERSION, items: {} };
}

export function parseProgress(value: unknown): EnrollmentProgress {
  let parsed: unknown = value;

  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return emptyProgress();
    }
  }

  if (
    parsed === null ||
    parsed === undefined ||
    (typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0)
  ) {
    return emptyProgress();
  }

  const result = enrollmentProgressSchema.safeParse(parsed);
  return result.success ? result.data : emptyProgress();
}
