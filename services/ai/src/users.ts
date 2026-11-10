import type { AuthUser } from "@innova/contracts";
import { AUTH_COOKIE_NAME, type AuthUserLookup } from "@innova/auth-kit";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

export interface UserLookup extends AuthUserLookup {
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
    async findById(id: string): Promise<AuthUser | undefined> {
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
