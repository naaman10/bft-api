import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { getResend } from "../lib/resend.js";
import { env } from "../config/env.js";
import type { AppEnv } from "../types.js";

export const webRoutes = new Hono<AppEnv>();

// Apply permissive CORS for public web endpoints
webRoutes.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  })
);

const consentSchema = z.object({
  email: z.string().email(),
  consent: z.boolean(),
});

webRoutes.post("/bft-learn-consent", async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch (error) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const validation = consentSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ 
      error: "Invalid request body", 
      details: validation.error.issues 
    }, 400);
  }

  const { email, consent } = validation.data;

  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  try {
    const { error } = await getResend().emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: "ellie@brighterfuturestutoring.com",
      template: {
        id: "notification",
        variables: {
          email_subject: "BFT Learn Consent Form Submission",
          email_recipient: "Ellie",
          email_body: `A parent has submitted the BFT Learn consent form.\n\nEmail: ${email}\nConsent: ${consent ? "YES" : "NO"}`,
          email_image: "https://res.cloudinary.com/njh101010/image/upload/v1773761306/brighterfutures/bft-logo-no-text-sun.png",
        },
      },
    });

    if (error) {
      throw new Error(`Failed to send notification email: ${error.message}`);
    }

    return c.json({ 
      ok: true,
      message: "Consent form submission received" 
    });
  } catch (error) {
    console.error("Error sending consent notification:", error);
    return c.json({ 
      error: "Failed to process consent form submission" 
    }, 500);
  }
});
