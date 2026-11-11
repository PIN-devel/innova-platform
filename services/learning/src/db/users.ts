import type { AuthUser } from "@innova/contracts";
import { AUTH_COOKIE_NAME } from "../auth.js";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

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
  if (!authServiceUrl) throw new Error("AUTH_SERVICE_URL is required");

  return {
    async findById(id) {
      const token = signSessionToken(id);
      const response = await fetchImpl(new URL("/api/auth/me", authServiceUrl), {
        method: "GET",
        headers: {
          cookie: `${cookieName}=${token}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      });
      if (response.status === 401 || response.status === 404) {
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`Auth service /api/auth/me failed with status ${response.status}`);
      }
      const body = (await response.json()) as { user?: AuthUser };
      return body.user;
    },
  };
}
