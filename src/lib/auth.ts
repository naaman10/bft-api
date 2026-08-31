import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

export function getAuthJwksUrl(): string {
  return (
    env.NEON_AUTH_JWKS_URL ??
    `${env.NEON_AUTH_BASE_URL.replace(/\/$/, "")}/.well-known/jwks.json`
  );
}

const jwks = createRemoteJWKSet(new URL(getAuthJwksUrl()));
const issuer = new URL(env.NEON_AUTH_BASE_URL).origin;

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadToUser(payload: JWTPayload): AuthUser | null {
  if (typeof payload.exp !== "number") {
    return null;
  }

  const id = asString(payload.sub);
  if (!id || id === "anonymous") {
    return null;
  }

  if (payload.banned === true) {
    return null;
  }

  return {
    id,
    email: asString(payload.email),
    name: asString(payload.name),
    emailVerified: payload.emailVerified === true,
    image: asString(payload.image),
    role: asString(payload.role),
  };
}

export function getBearerToken(
  authorizationHeader: string | undefined
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token, ...rest] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }

  return token;
}

export async function verifyAccessToken(
  token: string
): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ["EdDSA"],
    });
    return payloadToUser(payload);
  } catch {
    return null;
  }
}
