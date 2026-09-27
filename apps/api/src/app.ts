import Fastify from "fastify";
import { LogController, type FastifyBaseLogger } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { AUTH_COOKIE_NAME, createAuthGuard } from "./auth.js";
import { createDatabase } from "./db/client.js";
import { createExamRepository, type ExamRepository } from "./db/exam.js";
import { createUserRepository, type UserRepository } from "./db/users.js";
import { createApplicationLogger } from "./logger.js";
import { authRoutes } from "./routes/auth.js";
import { examRoutes } from "./routes/exam.js";
import { AppError, apiErrorBody, invalidInput } from "./errors.js";

const fastifyBadRequestCodes = new Set([
  "FST_ERR_VALIDATION",
  "FST_ERR_CTP_INVALID_JSON",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
]);

export function buildApp({
  logger = createApplicationLogger(),
  examRepository,
  userRepository,
  readinessCheck,
  jwtSecret = process.env.JWT_SECRET,
}: {
  logger?: false | FastifyBaseLogger;
  examRepository?: ExamRepository;
  userRepository?: UserRepository;
  readinessCheck?: () => Promise<void>;
  jwtSecret?: string;
} = {}) {
  if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET must be set to at least 32 characters");
  const app = Fastify({
    logger: false,
    loggerInstance: logger || undefined,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    ajv: { customOptions: { coerceTypes: false } },
  });
  const db = examRepository && userRepository ? undefined : createDatabase();
  const exams = examRepository ?? createExamRepository(db!);
  const users = userRepository ?? createUserRepository(db!);
  const checkReadiness = readinessCheck ?? (db
    ? async () => { await db.execute(sql`select 1`); }
    : async () => { throw new Error("Database is not configured for readiness checks"); });

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
    request.log.error({
      event: "app.error",
      errorCode: "INTERNAL_ERROR",
      statusCode: 500,
      err: error,
    }, "unexpected application error");
    const internal = new AppError(500, "INTERNAL_ERROR", "Internal server error");
    return reply.code(internal.statusCode).send(apiErrorBody(internal));
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.routeOptions.url === "/health") return;
    const routePath = request.routeOptions.url;
    const path = routePath && routePath !== "*"
      ? routePath
      : request.url.split("?", 1)[0] ?? "/";
    request.log.info({
      event: "http.request.completed",
      method: request.method,
      path,
      statusCode: reply.statusCode,
      durationMs: reply.elapsedTime,
    }, "HTTP request completed");
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
  app.get("/ready", async (request, reply) => {
    try {
      await checkReadiness();
      return { status: "ready" };
    } catch (error) {
      request.log.error({ event: "app.readiness.failed", err: error }, "readiness check failed");
      return reply.code(503).send({ status: "not_ready" });
    }
  });
  app.register(authRoutes, { prefix: "/api/auth", users });
  app.register(examRoutes, { prefix: "/api/exam", repository: exams, requireAuth: createAuthGuard(users) });

  return app;
}
