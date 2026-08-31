import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../middleware/require-admin.js";
import {
  DuplicateUserError,
  createAuthUser,
  requestMagicLink,
} from "../lib/neon-auth.js";
import type { AppEnv } from "../types.js";

const createUserBody = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(256)
    .transform((email) => email.toLowerCase()),
  name: z.string().trim().min(1).max(255),
});

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.post("/user/create", requireAdmin, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body." }, 400);
  }

  const parsed = createUserBody.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Invalid request body.",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      400
    );
  }

  let user;
  try {
    user = await createAuthUser(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      return c.json({ error: error.message }, 409);
    }
    throw error;
  }

  try {
    await requestMagicLink(user.email);
  } catch (error) {
    console.error(error);
    return c.json(
      {
        user,
        inviteSent: false,
        error: "User created but the invite email could not be sent.",
      },
      201
    );
  }

  return c.json({ user, inviteSent: true }, 201);
});
