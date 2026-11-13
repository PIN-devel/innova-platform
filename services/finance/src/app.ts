import Fastify, { LogController, type FastifyBaseLogger, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";
import {
  AUTH_COOKIE_NAME,
  AppError,
  apiErrorBody,
  createApprovedAuthGuard,
  createApplicationLogger,
  createCachedUserLookup,
  createRuntimeCacheStore,
  invalidInput,
  type CacheStore,
  type DeadLetterSink,
} from "@innova/auth-kit";
import { createDatabase } from "./db/client.js";
import { createUserLookup, type UserLookup } from "./db/users.js";
import { createFinanceRawRepository, type FinanceRawRepository } from "./db/finance-raw.js";
import { createBusinessFingerprint, createFinanceBusinessRepository, type FinanceBusinessRepository } from "./db/finance-business.js";
import { createFinanceManualRepository, type FinanceManualRepository } from "./db/finance-manual.js";
import { createFinanceClassificationRepository, type FinanceClassificationRepository } from "./db/finance-classification.js";
import { createFinanceReviewRepository } from "./db/finance-review.js";
import { createFinanceScheduleRepository, type FinanceScheduleRepository } from "./db/finance-schedule.js";
import { createFinanceTransactionRepository, type FinanceTransactionRepository } from "./db/finance-transactions.js";
import { createPdfPasswordRepository, type PdfPasswordRepository } from "./db/finance-pdf-password.js";
import { createPdfPasswordCipher, type PdfPasswordCipher } from "./finance-pdf-crypto.js";
import { createRawCipher } from "./finance-raw-crypto.js";
import { createFinanceExport } from "./finance-export/export.js";
import { READINESS_TIMEOUT_MS, runReadinessCheck } from "./readiness.js";
import { financeRawRoutes } from "./routes/finance-raw.js";
import { financeBusinessRoutes } from "./routes/finance-business.js";
import { financeTransactionRoutes } from "./routes/finance-transactions.js";
import { financePdfPasswordRoutes } from "./routes/finance-pdf-password.js";
import { internalEventRoutes } from "./routes/internal-events.js";

const fastifyBadRequestCodes = new Set([
  "FST_ERR_VALIDATION",
  "FST_ERR_CTP_INVALID_JSON",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
]);

/**
 * Finance (MOTIFIN) service: `/api/finance/**` only. Every other `/api/*` path
 * returns the shared NOT_FOUND error. User state comes from the auth service's
 * `UserLookup` on every request; this service never writes user data.
 */
export function buildApp({
  logger = createApplicationLogger(),
  userLookup,
  cacheStore,
  internalEventToken = process.env.INTERNAL_EVENT_TOKEN,
  deadLetterSink,
  readinessCheck,
  readinessTimeoutMs = READINESS_TIMEOUT_MS,
  financeRawRepository,
  financeManualRepository,
  financeTransactionRepository,
  financeExporter,
  financeBusinessRepository,
  financeClassificationRepository,
  financeScheduleRepository,
  financePdfPasswordRepository,
  financeAllowedOrigins = (process.env.FINANCE_ALLOWED_ORIGINS ?? "http://localhost:5174,http://127.0.0.1:5174").split(",").map((origin) => origin.trim()).filter(Boolean),
  jwtSecret = process.env.JWT_SECRET,
}: {
  logger?: false | FastifyBaseLogger;
  userLookup?: UserLookup;
  cacheStore?: CacheStore;
  internalEventToken?: string;
  deadLetterSink?: DeadLetterSink;
  readinessCheck?: (signal: AbortSignal) => Promise<unknown>;
  readinessTimeoutMs?: number;
  financeRawRepository?: FinanceRawRepository;
  financeManualRepository?: FinanceManualRepository;
  financeTransactionRepository?: FinanceTransactionRepository;
  financeExporter?: (owner: string, input: unknown) => Promise<Uint8Array>;
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
  app.register(cookie);
  app.register(jwt, { secret: jwtSecret, cookie: { cookieName: AUTH_COOKIE_NAME, signed: false } });
  app.decorateRequest("authUser", null);

  // Tests inject every dependency and need no database or auth-service connection.
  const activeCacheStore = cacheStore ?? createRuntimeCacheStore();
  const db = userLookup ? undefined : createDatabase();
  const rawUsers = userLookup ?? createUserLookup({
    signSessionToken: (userId) => app.jwt.sign({ sub: userId }),
  });
  const users = userLookup && !cacheStore
    ? rawUsers
    : createCachedUserLookup({
        delegate: rawUsers,
        cacheStore: activeCacheStore,
        logger: logger || undefined,
      });
  const rawCipher = db ? createRawCipher() : (process.env.FINANCE_RAW_ENCRYPTION_KEY ? createRawCipher() : undefined);
  const fingerprint = db ? createBusinessFingerprint() : (process.env.FINANCE_RAW_ENCRYPTION_KEY ? createBusinessFingerprint() : undefined);
  const finance = financeRawRepository ?? (db && rawCipher ? createFinanceRawRepository(db, rawCipher) : undefined);
  const business = financeBusinessRepository ?? (db && finance && rawCipher && fingerprint ? createFinanceBusinessRepository(db, finance, rawCipher, fingerprint) : undefined);
  const manual = financeManualRepository ?? (db && business && rawCipher && fingerprint ? createFinanceManualRepository(db, rawCipher, fingerprint) : undefined);
  const classification = financeClassificationRepository ?? (db && business && rawCipher ? createFinanceClassificationRepository(db, business, rawCipher, manual) : undefined);
  const review = business && classification ? createFinanceReviewRepository(business, classification, manual) : undefined;
  const schedule = financeScheduleRepository ?? (db && business && classification && rawCipher ? createFinanceScheduleRepository(db, business, classification, rawCipher, manual) : undefined);
  const transactions = financeTransactionRepository ?? (db && business && manual && classification && rawCipher && fingerprint ? createFinanceTransactionRepository(db, business, manual, classification, rawCipher, fingerprint) : undefined);
  const exporter = financeExporter ?? (db && business && manual && classification && finance ? createFinanceExport(db, business, manual, classification, finance) : undefined);
  let pdfCipher: PdfPasswordCipher | undefined;
  try { pdfCipher = createPdfPasswordCipher(); } catch { /* Optional feature stays unavailable; manual import remains available. */ }
  const pdfPassword = financePdfPasswordRepository ?? (db ? createPdfPasswordRepository(db, pdfCipher) : undefined);
  const checkReadiness = readinessCheck ?? (db
    ? async (signal: AbortSignal) => { await db.$client.query("select 1", [], { fetchOptions: { signal } }); }
    : async () => { throw new Error("Database is not configured for readiness checks"); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(apiErrorBody(error));
    }
    if (typeof error === "object" && error !== null && "code" in error && fastifyBadRequestCodes.has(String(error.code))) {
      const mapped = invalidInput("Invalid request");
      return reply.code(mapped.statusCode).send(apiErrorBody(mapped));
    }
    request.log.error({ event: "app.error", errorCode: "INTERNAL_ERROR", statusCode: 500, err: error }, "unexpected application error");
    const internal = new AppError(500, "INTERNAL_ERROR", "Internal server error");
    return reply.code(internal.statusCode).send(apiErrorBody(internal));
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    if (request.routeOptions.url === "/health" || request.routeOptions.url === "/api/health") return;
    const routePath = request.routeOptions.url;
    const path = routePath && routePath !== "*" ? routePath : request.url.split("?", 1)[0] ?? "/";
    request.log.info({ event: "http.request.completed", method: request.method, path, statusCode: reply.statusCode, durationMs: reply.elapsedTime }, "HTTP request completed");
  });

  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split("?", 1)[0] ?? "";
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      throw new AppError(404, "NOT_FOUND", "API route not found");
    }
    return reply.code(404).send({ message: "Route not found" });
  });

  const handleHealth = async () => ({ status: "ok" });
  app.get("/health", handleHealth);
  app.get("/api/health", handleHealth);

  const handleReady = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await runReadinessCheck(checkReadiness, readinessTimeoutMs);
      return { status: "ready" };
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "check_failed";
      request.log.error({ event: "app.readiness.failed", reason }, "readiness check failed");
      return reply.code(503).send({ status: "not_ready" });
    }
  };
  app.get("/ready", handleReady);
  app.get("/api/ready", handleReady);

  const requireAuth = createApprovedAuthGuard(users);
  if (finance) app.register(financeRawRoutes, { prefix: "/api/finance/raw", repository: finance, requireAuth, allowedOrigins: financeAllowedOrigins });
  if (business) app.register(financeBusinessRoutes, { prefix: "/api/finance/business", repository: business, classification, review, schedule, requireAuth, allowedOrigins: financeAllowedOrigins });
  if (manual && transactions && exporter) app.register(financeTransactionRoutes, { prefix: "/api/finance/transactions", manual, transactions, exporter, requireAuth, allowedOrigins: financeAllowedOrigins });
  if (pdfPassword) app.register(financePdfPasswordRoutes, { prefix: "/api/finance/pdf-password", repository: pdfPassword, users, allowedOrigins: financeAllowedOrigins });
  app.register(internalEventRoutes, {
    prefix: "/internal/events",
    cacheStore: activeCacheStore,
    pdfPasswordRepository: pdfPassword,
    internalToken: internalEventToken,
    deadLetterSink,
  });

  return app;
}
