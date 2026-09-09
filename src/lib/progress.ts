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

// Learners may change answers and completion, never marks or server timestamps.
const itemPatchSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  answer: z.json().optional(),
}).strict().refine(value => Object.keys(value).length > 0);

export const progressPatchSchema = z.object({
  action: z.enum(["save", "complete"]).optional(),
  currentItemId: z.string().trim().min(1).max(256).optional(),
  items: z.record(z.string().min(1).max(256), itemPatchSchema).optional(),
}).strict().refine(value => value.action === "complete" || value.currentItemId !== undefined ||
  Object.keys(value.items ?? {}).length > 0, "Provide a resume position or item changes.");

export type ProgressPatch = z.infer<typeof progressPatchSchema>;

export function mergeProgress(value: unknown, patch: ProgressPatch, now: string): EnrollmentProgress {
  const progress = parseProgress(value);
  const items = new Map(Object.entries(progress.items));
  for (const [id, change] of Object.entries(patch.items ?? {})) {
    const previous = items.get(id);
    const status = change.status ?? previous?.status ?? "in_progress";
    items.set(id, {
      ...previous, ...change, status, updatedAt: now,
      completedAt: status === "completed" ? previous?.completedAt ?? now : undefined,
    });
  }
  return { ...progress, ...(patch.currentItemId !== undefined ?
    { currentItemId: patch.currentItemId } : {}), items: Object.fromEntries(items) };
}
