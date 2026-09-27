import type { AuthUser } from "@innova/contracts";
import type { FastifyRequest } from "fastify";
import type { UserRepository } from "./db/users.js";
import { AppError } from "./errors.js";

export const AUTH_COOKIE_NAME = "exam_drill_auth";
export const JWT_EXPIRES_IN = "15m";
const COOKIE_MAX_AGE_SECONDS = 15 * 60;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
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

export function createAuthGuard(users: UserRepository) {
  return async (request: FastifyRequest) => {
    try {
      await request.jwtVerify({ onlyCookie: true });
    } catch {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }
    const user = await users.findById(request.user.sub);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    request.authUser = { id: user.id, email: user.email };
  };
}
