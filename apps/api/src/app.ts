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
import { createFinanceRawRepository, type FinanceRawRepository } from "./db/finance-raw.js";
import { createRawCipher } from "./finance-raw-crypto.js";
import { financeRawRoutes } from "./routes/finance-raw.js";
import { createBusinessFingerprint, createFinanceBusinessRepository, type FinanceBusinessRepository } from "./db/finance-business.js";
import { financeBusinessRoutes } from "./routes/finance-business.js";

import {createFinanceClassificationRepository,type FinanceClassificationRepository} from './db/finance-classification.js';

import {createFinanceReviewRepository} from './db/finance-review.js';

import {createFinanceScheduleRepository,type FinanceScheduleRepository} from './db/finance-schedule.js';

import {createPdfPasswordCipher,type PdfPasswordCipher} from './finance-pdf-crypto.js';
import {createPdfPasswordRepository,type PdfPasswordRepository} from './db/finance-pdf-password.js';
import {financePdfPasswordRoutes} from './routes/finance-pdf-password.js';

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
  financeRawRepository,
  financeBusinessRepository,
  financeClassificationRepository,
  financeScheduleRepository,
  financePdfPasswordRepository,
  financeAllowedOrigins = (process.env.FINANCE_ALLOWED_ORIGINS ?? "http://localhost:5174,http://127.0.0.1:5174").split(","),
  jwtSecret = process.env.JWT_SECRET,
}: {
  logger?: false | FastifyBaseLogger;
  examRepository?: ExamRepository;
  userRepository?: UserRepository;
  readinessCheck?: (signal: AbortSignal) => Promise<unknown>;
  readinessTimeoutMs?: number;
  curriculumRepository?: CurriculumReadRepository;
  curriculumAssets?: CurriculumAssetReader;
  financeRawRepository?: FinanceRawRepository;
  financeBusinessRepository?: FinanceBusinessRepository;
  financeClassificationRepository?: FinanceClassificationRepository;
  financeScheduleRepository?: FinanceScheduleRepository;
  financePdfPasswordRepository?: PdfPasswordRepository;
  financeAllowedOrigins?: string[];
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
  const finance = financeRawRepository ?? (db && process.env.FINANCE_RAW_ENCRYPTION_KEY ? createFinanceRawRepository(db, createRawCipher()) : undefined);
  const business = financeBusinessRepository ?? (db && finance && process.env.FINANCE_RAW_ENCRYPTION_KEY ? createFinanceBusinessRepository(db, finance, createRawCipher(), createBusinessFingerprint()) : undefined);
  const classification=financeClassificationRepository??(db&&business&&process.env.FINANCE_RAW_ENCRYPTION_KEY?createFinanceClassificationRepository(db,business,createRawCipher()):undefined);
  const review=business&&classification?createFinanceReviewRepository(business,classification):undefined;
  const schedule=financeScheduleRepository??(db&&business&&classification&&process.env.FINANCE_RAW_ENCRYPTION_KEY?createFinanceScheduleRepository(db,business,classification,createRawCipher()):undefined);
  let pdfCipher:PdfPasswordCipher|undefined;try{pdfCipher=createPdfPasswordCipher();}catch{/* Optional feature stays unavailable; manual import remains available. */}
  const pdfPassword=financePdfPasswordRepository??(db?createPdfPasswordRepository(db,pdfCipher):undefined);
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
  if (finance) app.register(financeRawRoutes, { prefix: "/api/finance/raw", repository: finance, requireAuth: createApprovedAuthGuard(users), allowedOrigins: financeAllowedOrigins });
  if (business) app.register(financeBusinessRoutes, { prefix: "/api/finance/business", repository: business, classification, review, schedule, requireAuth: createApprovedAuthGuard(users), allowedOrigins: financeAllowedOrigins });
  if(pdfPassword)app.register(financePdfPasswordRoutes,{prefix:'/api/finance/pdf-password',repository:pdfPassword,users,allowedOrigins:financeAllowedOrigins});
  app.register(examRoutes, { prefix: "/api/exam", repository: exams, requireAuth: createApprovedAuthGuard(users) });
  if (curriculum) app.register(curriculumRoutes, { prefix: "/api/curriculum", repository: curriculum, assets: curriculumAssets, requireAuth: createApprovedAuthGuard(users) });
  app.register(adminUserRoutes, { prefix: "/api/admin", users, requireAdmin: createAdminAuthGuard(users) });

  return app;
}
