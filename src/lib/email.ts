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


export async function sendCompletionNotification(input: {
  enrollmentId: string;
  completedAt: string;
  studentName: string;
  studentEmail: string;
  contentName: string;
}): Promise<void> {
  if (!env.COMPLETION_NOTIFICATION_EMAIL || !env.RESEND_FROM_EMAIL) {
    throw new Error("Completion notification email is not configured.");
  }
  const { error } = await getResend().emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: env.COMPLETION_NOTIFICATION_EMAIL,
    template: {
      id: "notifications",
      variables: {
        emai_subject: "A pupil has completed an assignment",
        email_recipient: "Ellie",
        email_body: `${input.studentName} (${input.studentEmail}) has completed the assignment "${input.contentName}".`,
        email_image: "https://res.cloudinary.com/njh101010/image/upload/v1773761306/brighterfutures/bft-logo-no-text-sun.png",
      },
    },
  }, { idempotencyKey: `completion/${input.enrollmentId}/${input.completedAt}` });
  if (error) throw new Error(`Completion notification failed: ${error.message}`);
}
