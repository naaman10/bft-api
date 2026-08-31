import { env } from "../config/env.js";
import { getResend } from "./resend.js";
import { magicLinkEmail } from "../emails/magic-link.js";

export async function sendMagicLinkEmail(input: {
  to: string;
  name?: string | null;
  linkUrl: string;
  linkType?: string;
}): Promise<void> {
  if (!env.RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const { subject, html, text } = magicLinkEmail(input);
  const { error } = await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(`Resend failed to send email: ${error.message}`);
  }
}
