import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { AUTH_COOKIE_NAME, createAuthGuard } from "./auth.js";
import { createDatabase } from "./db/client.js";
import { createExamRepository, type ExamRepository } from "./db/exam.js";
import { createUserRepository, type UserRepository } from "./db/users.js";
import { authRoutes } from "./routes/auth.js";
import { examRoutes } from "./routes/exam.js";
import { AppError, apiErrorBody, invalidInput } from "./errors.js";

const fastifyBadRequestCodes = new Set([
  "FST_ERR_VALIDATION",
  "FST_ERR_CTP_INVALID_JSON",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
]);

export function buildApp({ logger = true, examRepository, userRepository, jwtSecret = process.env.JWT_SECRET }: { logger?: boolean; examRepository?: ExamRepository; userRepository?: UserRepository; jwtSecret?: string } = {}) {
  if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  const db = examRepository && userRepository ? undefined : createDatabase();
  const exams = examRepository ?? createExamRepository(db!);
  const users = userRepository ?? createUserRepository(db!);

  app.register(cookie);
  app.register(jwt, { secret: jwtSecret, cookie: { cookieName: AUTH_COOKIE_NAME, signed: false } });
  app.decorateRequest("authUser", null);
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(apiErrorBody(error));
    }
    if (typeof error === "object" && error !== null && "code" in error && fastifyBadRequestCodes.has(String(error.code))) {
      const mapped = invalidInput("Invalid request");
      return reply.code(mapped.statusCode).send(apiErrorBody(mapped));
    }
    request.log.error({ err: error }, "Unhandled request error");
    const internal = new AppError(500, "INTERNAL_ERROR", "Internal server error");
    return reply.code(internal.statusCode).send(apiErrorBody(internal));
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?", 1)[0] ?? "";
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      throw new AppError(404, "NOT_FOUND", "API route not found");
    }
    return reply.code(404).send({ message: "Route not found" });
  });

  app.get("/", async () => ({ hello: "world" }));
  app.get("/health", async () => ({ status: "ok" }));
  app.register(authRoutes, { prefix: "/api/auth", users });
  app.register(examRoutes, { prefix: "/api/exam", repository: exams, requireAuth: createAuthGuard(users) });

  return app;
}
