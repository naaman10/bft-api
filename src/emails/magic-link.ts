function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type MagicLinkEmailInput = {
  name?: string | null;
  linkUrl: string;
  linkType?: string;
};

export function magicLinkEmail(input: MagicLinkEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isInvite = input.linkType !== "forget-password" && input.linkType !== "email-verification";
  const subject = isInvite
    ? "Sign in to BFT Learn"
    : input.linkType === "forget-password"
      ? "Reset your BFT Learn password"
      : "Verify your BFT Learn email";
  const heading = isInvite
    ? "Welcome to BFT Learn"
    : input.linkType === "forget-password"
      ? "Reset your password"
      : "Verify your email";
  const action = isInvite ? "Sign in" : "Continue";
  const greeting = input.name
    ? `Hi ${escapeHtml(input.name)},`
    : "Hi,";
  const intro = isInvite
    ? "An account has been created for you. Use the button below to sign in for the first time."
    : "Use the button below to continue.";

  const html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">${heading}</h1>
  <p>${greeting}</p>
  <p>${intro}</p>
  <p style="text-align: center; margin: 28px 0;">
    <a href="${escapeHtml(input.linkUrl)}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px;">${action}</a>
  </p>
  <p style="color: #6b7280; font-size: 14px; word-break: break-all;">If the button does not work, copy this link into your browser:<br>${escapeHtml(input.linkUrl)}</p>
  <p style="color: #6b7280; font-size: 14px;">If you were not expecting this email, you can ignore it.</p>
</div>`;

  const text = [
    heading,
    "",
    input.name ? `Hi ${input.name},` : "Hi,",
    intro,
    "",
    input.linkUrl,
    "",
    "If you were not expecting this email, you can ignore it.",
  ].join("\n");

  return { subject, html, text };
}
