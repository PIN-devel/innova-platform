import type { ApprovalStatus, AuthUser, UserRole } from "@innova/contracts";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import "@fastify/jwt";
import type { CacheStore } from "./cache.js";
import { AppError } from "./errors.js";

/**
 * Shared session cookie name for every Innova service.
 * The gateway bridges Firebase Hosting's `__session` cookie to this name
 * (and to the legacy `exam_drill_auth` name while Render still reads it).
 */
export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "innova_auth";
export const JWT_EXPIRES_IN = "15m";
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    // `email`, `role`, `approvalStatus` are informational snapshots taken at
    // issue time. Guards still authorize from the current DB record.
    payload: { sub: string; email?: string; role?: UserRole; approvalStatus?: ApprovalStatus; jti?: string; auth_time?: number };
    user: { sub: string; email?: string; role?: UserRole; approvalStatus?: ApprovalStatus; jti?: string; auth_time?: number };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}

/** Minimal user lookup the guards need; each service supplies its own repository. */
export interface AuthUserLookup {
  findById(id: string): Promise<AuthUser | undefined>;
}

const DEFAULT_AUTH_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_USER_CACHE_TTL_MS = 60_000;
const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const METADATA_IDENTITY_TIMEOUT_MS = 2_000;
const ID_TOKEN_EXPIRY_SAFETY_MS = 60_000;
const DEFAULT_ID_TOKEN_TTL_MS = 50 * 60 * 1000;

export type GcpIdTokenProvider = ((audience: string) => Promise<string | undefined>) & {
  reset?: (audience?: string) => void;
};

function parseJwtExpiryMs(token: string): number | undefined {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp)
      ? payload.exp * 1000
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAudienceOrigin(audience: string): string {
  return new URL(audience).origin;
}

/**
 * Fetches and caches Google-signed OIDC ID tokens from the Cloud Run / GCE
 * metadata server for service-to-service IAM authentication (`roles/run.invoker`).
 */
export function createGcpIdentityTokenProvider({
  metadataIdentityUrl = METADATA_IDENTITY_URL,
  fetchImpl = fetch,
  now = () => Date.now(),
  defaultTtlMs = DEFAULT_ID_TOKEN_TTL_MS,
}: {
  metadataIdentityUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  defaultTtlMs?: number;
} = {}): GcpIdTokenProvider {
  const cache = new Map<string, { token: string; expiresAtMs: number }>();

  const provider: GcpIdTokenProvider = async (audience: string) => {
    const origin = normalizeAudienceOrigin(audience);
    const cached = cache.get(origin);
    if (cached && now() < cached.expiresAtMs) {
      return cached.token;
    }

    const url = `${metadataIdentityUrl}?audience=${encodeURIComponent(origin)}`;
    const response = await fetchImpl(url, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(METADATA_IDENTITY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Metadata server identity error: status ${response.status}`);
    }
    const token = (await response.text()).trim();
    if (!token) {
      throw new Error("Metadata server returned empty identity token");
    }

    const jwtExpMs = parseJwtExpiryMs(token);
    const expiresAtMs =
      jwtExpMs !== undefined
        ? Math.max(now(), jwtExpMs - ID_TOKEN_EXPIRY_SAFETY_MS)
        : now() + defaultTtlMs;
    cache.set(origin, { token, expiresAtMs });
    return token;
  };

  provider.reset = (audience?: string) => {
    if (!audience) {
      cache.clear();
      return;
    }
    try {
      cache.delete(normalizeAudienceOrigin(audience));
    } catch {
      cache.delete(audience);
    }
  };

  return provider;
}

/**
 * Resolves whether service-to-service OIDC ID token injection should be enabled
 * for the current runtime (`GCP_IAM_AUTH_ENABLED`, or Cloud Run `K_SERVICE` + HTTPS).
 */
export function resolveRuntimeIdTokenProvider({
  idTokenProvider,
  enableIamAuth,
  targetUrl,
  fetchImpl = fetch,
}: {
  idTokenProvider?: GcpIdTokenProvider;
  enableIamAuth?: boolean;
  targetUrl?: string;
  fetchImpl?: typeof fetch;
} = {}): GcpIdTokenProvider | undefined {
  if (idTokenProvider) return idTokenProvider;
  const enabled =
    enableIamAuth ??
    (process.env.GCP_IAM_AUTH_ENABLED !== undefined
      ? process.env.GCP_IAM_AUTH_ENABLED === "true"
      : Boolean(process.env.K_SERVICE && targetUrl?.startsWith("https://")));
  return enabled ? createGcpIdentityTokenProvider({ fetchImpl }) : undefined;
}

export function userCacheKey(userId: string): string {
  return `auth:user:${userId}`;
}

export function resolveAuthUserCacheTtlMs(
  raw = process.env.AUTH_USER_CACHE_TTL_MS,
): number {
  if (!raw) return DEFAULT_USER_CACHE_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_USER_CACHE_TTL_MS;
}

/**
 * Shared HTTP client for querying the Auth microservice (`GET /api/auth/me`).
 */
export function createRemoteUserLookup({
  authServiceUrl = process.env.AUTH_SERVICE_URL,
  cookieName = AUTH_COOKIE_NAME,
  signSessionToken,
  idTokenProvider,
  enableIamAuth,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
}: {
  authServiceUrl?: string;
  cookieName?: string;
  signSessionToken: (userId: string) => string;
  idTokenProvider?: GcpIdTokenProvider;
  enableIamAuth?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): AuthUserLookup {
  if (!authServiceUrl) throw new Error("AUTH_SERVICE_URL is required");
  const activeIdTokenProvider = resolveRuntimeIdTokenProvider({
    idTokenProvider,
    enableIamAuth,
    targetUrl: authServiceUrl,
    fetchImpl,
  });

  return {
    async findById(id: string): Promise<AuthUser | undefined> {
      const token = signSessionToken(id);
      const headers: Record<string, string> = {
        cookie: `${cookieName}=${token}`,
        accept: "application/json",
      };
      if (activeIdTokenProvider) {
        const idToken = await activeIdTokenProvider(authServiceUrl);
        if (idToken) {
          headers["x-serverless-authorization"] = `Bearer ${idToken}`;
          headers["authorization"] = `Bearer ${idToken}`;
        }
      }
      const response = await fetchImpl(new URL("/api/auth/me", authServiceUrl), {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 403 && activeIdTokenProvider?.reset) {
        activeIdTokenProvider.reset(authServiceUrl);
      }
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

/**
 * Wraps an `AuthUserLookup` with Cache-Aside caching and Fail-Open fallback
 * when the cache store is unavailable.
 */
export function createCachedUserLookup<T extends AuthUserLookup>({
  delegate,
  cacheStore,
  ttlMs = resolveAuthUserCacheTtlMs(),
  logger,
}: {
  delegate: T;
  cacheStore: CacheStore;
  ttlMs?: number;
  logger?: FastifyBaseLogger;
}): T {
  if (ttlMs <= 0) return delegate;

  return {
    ...delegate,
    async findById(id: string): Promise<AuthUser | undefined> {
      const key = userCacheKey(id);
      try {
        const cached = await cacheStore.get<AuthUser>(key);
        if (cached) return cached;
      } catch (error) {
        logger?.warn(
          {
            event: "cache.auth_user.read_failed",
            userId: id,
            err: error instanceof Error ? { name: error.name, message: error.message } : undefined,
          },
          "Auth user cache read failed; falling back to remote lookup",
        );
      }

      const user = await delegate.findById(id);
      if (user) {
        await cacheStore.set(key, user, ttlMs).catch((error) => {
          logger?.warn(
            {
              event: "cache.auth_user.write_failed",
              userId: id,
              err: error instanceof Error ? { name: error.name, message: error.message } : undefined,
            },
            "Auth user cache write failed",
          );
        });
      }
      return user;
    },
  };
}

export function authCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    partitioned: isProduction,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export function clearAuthCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    path: "/",
    httpOnly: true,
    sameSite: isProduction ? ("none" as const) : ("lax" as const),
    secure: isProduction,
    partitioned: isProduction,
  };
}

export function createAuthGuard(users: AuthUserLookup) {
  return async (request: FastifyRequest) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const user = await users.findById(request.user.sub);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    request.authUser = { id: user.id, email: user.email, approvalStatus: user.approvalStatus, role: user.role };
  };
}

export function createApprovedAuthGuard(users: AuthUserLookup) {
  const requireAuth = createAuthGuard(users);
  return async (request: FastifyRequest) => {
    await requireAuth(request);
    if (request.authUser?.approvalStatus !== "approved") {
      if (request.authUser?.approvalStatus === "rejected") {
        throw new AppError(403, "SIGNUP_REJECTED", "Signup request was rejected");
      }
      throw new AppError(403, "APPROVAL_PENDING", "Account approval is pending");
    }
  };
}

export function createAdminAuthGuard(users: AuthUserLookup) {
  const requireAuth = createAuthGuard(users);
  return async (request: FastifyRequest) => {
    await requireAuth(request);
    if (request.authUser?.role !== "admin") {
      throw new AppError(403, "FORBIDDEN", "Administrator access required");
    }
    if (request.authUser.approvalStatus === "rejected") {
      throw new AppError(403, "SIGNUP_REJECTED", "Signup request was rejected");
    }
  };
}
