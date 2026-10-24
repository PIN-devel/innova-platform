import Fastify from "fastify";
import { LogController, type FastifyBaseLogger } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";
import { AUTH_COOKIE_NAME, createAdminAuthGuard, createApprovedAuthGuard } from "./auth.js";
import { createDatabase } from "./db/client.js";
import { createExamRepository, type ExamRepository } from "./db/exam.js";
import { createUserRepository, type UserRepository } from "./db/users.js";
import { createApplicationLogger } from "./logger.js";
import { READINESS_TIMEOUT_MS, runReadinessCheck } from "./readiness.js";
import { authRoutes } from "./routes/auth.js";
import { adminUserRoutes } from "./routes/admin-users.js";
import { examRoutes } from "./routes/exam.js";
import { curriculumRoutes } from "./routes/curriculum.js";
import { createCurriculumReadRepository, type CurriculumReadRepository } from "./db/curriculum-read.js";
import { createRuntimeCurriculumAssetReader, type CurriculumAssetReader } from "./curriculum-assets.js";
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
  readinessTimeoutMs = READINESS_TIMEOUT_MS,
  curriculumRepository,
  curriculumAssets = createRuntimeCurriculumAssetReader(),
  jwtSecret = process.env.JWT_SECRET,
}: {
  logger?: false | FastifyBaseLogger;
  examRepository?: ExamRepository;
  userRepository?: UserRepository;
  readinessCheck?: (signal: AbortSignal) => Promise<unknown>;
  readinessTimeoutMs?: number;
  curriculumRepository?: CurriculumReadRepository;
  curriculumAssets?: CurriculumAssetReader;
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
  // Existing isolated legacy tests may omit Curriculum injection. Production
  // always has a DB; avoid a second connection and keep legacy tests DB-free.
  const curriculum = curriculumRepository ?? (db ? createCurriculumReadRepository(db) : undefined);
  const checkReadiness = readinessCheck ?? (db
    ? async (signal: AbortSignal) => { await db.$client.query("select 1", [], { fetchOptions: { signal } }); }
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
      await runReadinessCheck(checkReadiness, readinessTimeoutMs);
      return { status: "ready" };
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "check_failed";
      request.log.error({ event: "app.readiness.failed", reason }, "readiness check failed");
      return reply.code(503).send({ status: "not_ready" });
    }
  });
  app.register(authRoutes, { prefix: "/api/auth", users });
  app.register(examRoutes, { prefix: "/api/exam", repository: exams, requireAuth: createApprovedAuthGuard(users) });
  if (curriculum) app.register(curriculumRoutes, { prefix: "/api/curriculum", repository: curriculum, assets: curriculumAssets, requireAuth: createApprovedAuthGuard(users) });
  app.register(adminUserRoutes, { prefix: "/api/admin", users, requireAdmin: createAdminAuthGuard(users) });

  return app;
}
