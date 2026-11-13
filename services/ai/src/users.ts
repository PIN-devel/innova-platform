import type { AuthUser } from "@innova/contracts";
import { AUTH_COOKIE_NAME, createRemoteUserLookup, type AuthUserLookup } from "@innova/auth-kit";

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
  return createRemoteUserLookup({
    authServiceUrl,
    cookieName,
    signSessionToken,
    fetchImpl,
  });
}
