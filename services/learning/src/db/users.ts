import type { AuthUser } from "@innova/contracts";
import { createRemoteUserLookup } from "@innova/auth-kit";
import { AUTH_COOKIE_NAME } from "../auth.js";

/**
 * Auth service boundary for the Learning microservice.
 * Learning never connects to `innova_auth` DB directly; it queries the Auth
 * microservice over HTTP for per-request approval checks.
 */
export interface UserLookup {
  findById(id: string): Promise<AuthUser | undefined>;
}

export function createUserLookup({
  authServiceUrl = process.env.AUTH_SERVICE_URL,
  cookieName = AUTH_COOKIE_NAME,
  signSessionToken,
  fetchImpl = fetch,
}: {
  authServiceUrl?: string;
  cookieName?: string;
  signSessionToken: (userId: string) => string;
  fetchImpl?: typeof fetch;
}): UserLookup {
  return createRemoteUserLookup({
    authServiceUrl,
    cookieName,
    signSessionToken,
    fetchImpl,
  });
}
