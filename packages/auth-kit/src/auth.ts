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
  fetchImpl = fetch,
  timeoutMs = DEFAULT_AUTH_REQUEST_TIMEOUT_MS,
}: {
  authServiceUrl?: string;
  cookieName?: string;
  signSessionToken: (userId: string) => string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): AuthUserLookup {
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
        signal: AbortSignal.timeout(timeoutMs),
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
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export function clearAuthCookieOptions() {
  return { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
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
