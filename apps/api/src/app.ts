import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { AUTH_COOKIE_NAME, authError, createAuthGuard } from "./auth.js";
import { createDatabase } from "./db/client.js";
import { createExamRepository, type ExamRepository } from "./db/exam.js";
import { createUserRepository, type UserRepository } from "./db/users.js";
import { authRoutes } from "./routes/auth.js";
import { examRoutes } from "./routes/exam.js";

export function buildApp({ logger = true, examRepository, userRepository, jwtSecret = process.env.JWT_SECRET }: { logger?: boolean; examRepository?: ExamRepository; userRepository?: UserRepository; jwtSecret?: string } = {}) {
  if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  const db = examRepository && userRepository ? undefined : createDatabase();
  const exams = examRepository ?? createExamRepository(db!);
  const users = userRepository ?? createUserRepository(db!);

  app.register(cookie);
  app.register(jwt, { secret: jwtSecret, cookie: { cookieName: AUTH_COOKIE_NAME, signed: false } });
  app.decorateRequest("authUser", null);
  app.setErrorHandler((error, _request, reply) => {
    if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 400) {
      return authError(reply, 400, "INVALID_INPUT", "Invalid request");
    }
    return authError(reply, 500, "INTERNAL_ERROR", "Internal server error");
  });

  app.get("/", async () => ({ hello: "world" }));
  app.get("/health", async () => ({ status: "ok" }));
  app.register(authRoutes, { prefix: "/api/auth", users });
  app.register(examRoutes, { prefix: "/api/exam", repository: exams, requireAuth: createAuthGuard(users) });

  return app;
}
