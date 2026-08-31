import { createPublicKey, verify } from "node:crypto";
import { getAuthJwksUrl } from "./auth.js";

const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;

type Jwk = {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
};

type Jwks = { keys: Jwk[] };

let cachedJwks: Jwks | undefined;
let cachedAt = 0;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export type NeonWebhookPayload = {
  event_id?: string;
  event_type?: string;
  user?: {
    email?: string;
    name?: string;
  };
  event_data?: {
    link_type?: string;
    link_url?: string;
  };
};

async function fetchJwks(): Promise<Jwks> {
  const response = await fetch(getAuthJwksUrl());

  if (!response.ok) {
    throw new WebhookVerificationError(
      `Failed to fetch JWKS (${response.status})`
    );
  }

  const jwks = (await response.json()) as Jwks;
  cachedJwks = jwks;
  cachedAt = Date.now();
  return jwks;
}

async function getJwks(forceRefresh = false): Promise<Jwks> {
  if (
    !forceRefresh &&
    cachedJwks &&
    Date.now() - cachedAt < JWKS_TTL_MS
  ) {
    return cachedJwks;
  }

  return fetchJwks();
}

function findKey(jwks: Jwks, kid: string): Jwk | undefined {
  return jwks.keys.find((key) => key.kid === kid);
}

export async function verifyNeonWebhook(
  rawBody: string,
  headers: {
    signature: string | undefined;
    kid: string | undefined;
    timestamp: string | undefined;
  }
): Promise<NeonWebhookPayload> {
  const { signature, kid, timestamp } = headers;

  if (!signature || !kid || !timestamp) {
    throw new WebhookVerificationError("Missing required Neon webhook headers");
  }

  const ageMs = Date.now() - Number(timestamp);
  if (!Number.isFinite(ageMs) || ageMs > WEBHOOK_MAX_AGE_MS || ageMs < -WEBHOOK_MAX_AGE_MS) {
    throw new WebhookVerificationError("Webhook timestamp is too old");
  }

  let jwks = await getJwks();
  let jwk = findKey(jwks, kid);

  if (!jwk) {
    jwks = await getJwks(true);
    jwk = findKey(jwks, kid);
  }

  if (!jwk) {
    throw new WebhookVerificationError(`Key ${kid} not found in JWKS`);
  }

  const [headerB64, emptyPayload, signatureB64] = signature.split(".");
  if (!headerB64 || emptyPayload !== "" || !signatureB64) {
    throw new WebhookVerificationError("Expected detached JWS format");
  }

  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayload = `${timestamp}.${payloadB64}`;
  const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString(
    "base64url"
  );
  const signingInput = `${headerB64}.${signaturePayloadB64}`;

  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const isValid = verify(
    null,
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signatureB64, "base64url")
  );

  if (!isValid) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }

  try {
    return JSON.parse(rawBody) as NeonWebhookPayload;
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON");
  }
}
