import { env } from "../config/env.js";

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export class DuplicateUserError extends Error {
  constructor(email: string) {
    super(`A user with email ${email} already exists.`);
    this.name = "DuplicateUserError";
  }
}

export type CreatedAuthUser = {
  id: string;
  email: string;
  name: string;
};

function neonAdminConfig() {
  const { NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID } = env;

  if (!NEON_API_KEY || !NEON_PROJECT_ID || !NEON_BRANCH_ID) {
    throw new Error(
      "Neon user management is not configured. Set NEON_API_KEY, NEON_PROJECT_ID, and NEON_BRANCH_ID."
    );
  }

  return {
    apiKey: NEON_API_KEY,
    projectId: NEON_PROJECT_ID,
    branchId: NEON_BRANCH_ID,
  };
}

function isDuplicateUserResponse(status: number, body: string): boolean {
  if (status === 409) {
    return true;
  }

  return (
    (status === 400 || status === 422) &&
    /already|exist|duplicate|unique/i.test(body)
  );
}

export async function createAuthUser(input: {
  email: string;
  name: string;
}): Promise<CreatedAuthUser> {
  const { apiKey, projectId, branchId } = neonAdminConfig();
  const response = await fetch(
    `${NEON_API_BASE}/projects/${projectId}/branches/${branchId}/auth/users`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: input.email, name: input.name }),
    }
  );

  const body = await response.text();

  if (!response.ok) {
    if (isDuplicateUserResponse(response.status, body)) {
      throw new DuplicateUserError(input.email);
    }

    throw new Error(
      `Failed to create Neon Auth user (${response.status}): ${body}`
    );
  }

  const data = JSON.parse(body) as { id: string };

  if (!data.id) {
    throw new Error("Neon Auth user was created without an id.");
  }

  return { id: data.id, email: input.email, name: input.name };
}

export async function requestMagicLink(email: string): Promise<void> {
  if (!env.LEARN_APP_URL) {
    throw new Error("LEARN_APP_URL is not configured.");
  }

  const callbackURL = new URL("/dashboard", env.LEARN_APP_URL).href;
  const url = `${env.NEON_AUTH_BASE_URL.replace(/\/$/, "")}/sign-in/magic-link`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, callbackURL }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to request magic link (${response.status}): ${body}`);
  }
}
