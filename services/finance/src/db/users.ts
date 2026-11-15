import type { AuthUser } from "@innova/contracts";
import {
  createRemoteUserLookup,
  resolveRuntimeIdTokenProvider,
  type GcpIdTokenProvider,
} from "@innova/auth-kit";
import { AUTH_COOKIE_NAME } from "../auth.js";
import { AppError } from "../errors.js";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Auth service boundary for the Finance microservice.
 * Finance never connects to `innova_auth` DB directly; it queries the Auth
 * microservice over HTTP for per-request approval checks and PDF step-up
 * password verification.
 */
export interface UserLookup {
  findById(id: string): Promise<AuthUser | undefined>;
  verifyPassword?(id: string, password: string): Promise<boolean>;
}

export function createUserLookup({
  authServiceUrl = process.env.AUTH_SERVICE_URL,
  cookieName = AUTH_COOKIE_NAME,
  signSessionToken,
  idTokenProvider,
  enableIamAuth,
  fetchImpl = fetch,
}: {
  authServiceUrl?: string;
  cookieName?: string;
  signSessionToken: (userId: string) => string;
  idTokenProvider?: GcpIdTokenProvider;
  enableIamAuth?: boolean;
  fetchImpl?: typeof fetch;
}): UserLookup {
  const activeIdTokenProvider = resolveRuntimeIdTokenProvider({
    idTokenProvider,
    enableIamAuth,
    targetUrl: authServiceUrl,
    fetchImpl,
  });

  const remoteLookup = createRemoteUserLookup({
    authServiceUrl,
    cookieName,
    signSessionToken,
    idTokenProvider: activeIdTokenProvider,
    enableIamAuth: Boolean(activeIdTokenProvider),
    fetchImpl,
    timeoutMs: AUTH_REQUEST_TIMEOUT_MS,
  });

  return {
    findById: remoteLookup.findById,

    async verifyPassword(id, password) {
      // Step-up password verification always reads authoritative auth state.
      const user = await remoteLookup.findById(id);
      if (!user || user.approvalStatus !== "approved") {
        throw new AppError(403, "FORBIDDEN", "Approval changed");
      }
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json",
      };
      if (activeIdTokenProvider) {
        const idToken = await activeIdTokenProvider(authServiceUrl!);
        if (idToken) {
          headers["x-serverless-authorization"] = `Bearer ${idToken}`;
          headers["authorization"] = `Bearer ${idToken}`;
        }
      }
      const response = await fetchImpl(new URL("/api/auth/login", authServiceUrl!), {
        method: "POST",
        headers,
        body: JSON.stringify({ email: user.email, password }),
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      });
      if (response.status === 403 && activeIdTokenProvider?.reset) {
        activeIdTokenProvider.reset(authServiceUrl!);
      }
      if (response.status === 200) {
        return true;
      }
      if (response.status === 400 || response.status === 401) {
        return false;
      }
      throw new Error(`Auth service /api/auth/login failed with status ${response.status}`);
    },
  };
}
