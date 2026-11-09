import type { ApprovalStatus, AuthUser, UserRole } from "@innova/contracts";
import type { FastifyRequest } from "fastify";
import "@fastify/jwt";
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
