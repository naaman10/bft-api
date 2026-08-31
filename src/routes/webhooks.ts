import { Hono } from "hono";
import { sendMagicLinkEmail } from "../lib/email.js";
import {
  WebhookVerificationError,
  verifyNeonWebhook,
} from "../lib/neon-webhook.js";
import type { AppEnv } from "../types.js";

const recentEventIds = new Map<string, number>();
const EVENT_TTL_MS = 10 * 60 * 1000;

function pruneSeenEvents(): void {
  const now = Date.now();

  for (const [id, seenAt] of recentEventIds) {
    if (now - seenAt > EVENT_TTL_MS) {
      recentEventIds.delete(id);
    }
  }
}

function alreadyHandled(eventId: string | undefined): boolean {
  pruneSeenEvents();
  return Boolean(eventId && recentEventIds.has(eventId));
}

function markHandled(eventId: string | undefined): void {
  if (eventId) {
    recentEventIds.set(eventId, Date.now());
  }
}

export const webhookRoutes = new Hono<AppEnv>();

webhookRoutes.post("/neon-auth", async (c) => {
  const rawBody = await c.req.text();

  let payload;
  try {
    payload = await verifyNeonWebhook(rawBody, {
      signature: c.req.header("X-Neon-Signature"),
      kid: c.req.header("X-Neon-Signature-Kid"),
      timestamp: c.req.header("X-Neon-Timestamp"),
    });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return c.json({ error: error.message }, 401);
    }
    throw error;
  }

  if (alreadyHandled(payload.event_id)) {
    return c.json({ ok: true });
  }

  if (payload.event_type !== "send.magic_link") {
    return c.json({ ok: true });
  }

  const email = payload.user?.email;
  const linkUrl = payload.event_data?.link_url;

  if (!email || !linkUrl) {
    return c.json({ error: "Magic link payload is missing email or link." }, 400);
  }

  await sendMagicLinkEmail({
    to: email,
    name: payload.user?.name,
    linkUrl,
    linkType: payload.event_data?.link_type,
  });

  markHandled(payload.event_id);
  return c.json({ ok: true });
});
