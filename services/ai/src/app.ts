import Fastify, {
  LogController,
  type FastifyBaseLogger,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import { randomUUID } from "node:crypto";
import {
  AUTH_COOKIE_NAME,
  AppError,
  apiErrorBody,
  createApplicationLogger,
  createCachedUserLookup,
  createRuntimeCacheStore,
  createRuntimeDistributedLock,
  invalidInput,
  type CacheStore,
  type DeadLetterSink,
  type DistributedLock,
} from "@innova/auth-kit";
import { createUserLookup, type UserLookup } from "./users.js";
import { READINESS_TIMEOUT_MS, runReadinessCheck } from "./readiness.js";
import { aiChatRoutes } from "./routes/ai-chat.js";
import { internalEventRoutes } from "./routes/internal-events.js";
import {
  DistributedExaoneRateGate,
  ExaoneChatProvider,
  type AiChatProvider,
  type RateGate,
} from "./providers/index.js";

const DEFAULT_STREAM_TIMEOUT_MS = 55_000;

function resolveDefaultStreamTimeoutMs(): number {
  const parsed = Number(process.env.AI_STREAM_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STREAM_TIMEOUT_MS;
}

const fastifyBadRequestCodes = new Set([
  "FST_ERR_VALIDATION",
  "FST_ERR_CTP_INVALID_JSON",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
  "FST_ERR_CTP_BODY_TOO_LARGE",
]);

export function buildApp({
  logger = createApplicationLogger(),
  userLookup,
  cacheStore,
  distributedLock,
  internalEventToken = process.env.INTERNAL_EVENT_TOKEN,
  deadLetterSink,
  readinessCheck,
  readinessTimeoutMs = READINESS_TIMEOUT_MS,
  jwtSecret = process.env.JWT_SECRET,
  chatProvider,
  rateGate,
  streamTimeoutMs = resolveDefaultStreamTimeoutMs(),
  apiKey,
  baseUrl,
  fetchImpl,
}: {
  logger?: false | FastifyBaseLogger;
  userLookup?: UserLookup;
  cacheStore?: CacheStore;
  distributedLock?: DistributedLock;
  internalEventToken?: string;
  deadLetterSink?: DeadLetterSink;
  readinessCheck?: (signal: AbortSignal) => Promise<unknown>;
  readinessTimeoutMs?: number;
  jwtSecret?: string;
  chatProvider?: AiChatProvider;
  rateGate?: RateGate;
  streamTimeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}) {
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters");
  }

  const app = Fastify({
    logger: false,
    loggerInstance: logger || undefined,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 1024 * 1024,
    ajv: { customOptions: { coerceTypes: false } },
  });

  app.register(cookie);
  app.register(jwt, {
    secret: jwtSecret,
    cookie: { cookieName: AUTH_COOKIE_NAME, signed: false },
  });
  app.decorateRequest("authUser", null);

  const activeCacheStore = cacheStore ?? createRuntimeCacheStore();
  const rawUsers =
    userLookup ??
    createUserLookup({
      signSessionToken: (userId) => app.jwt.sign({ sub: userId }),
    });
  const users =
    userLookup && !cacheStore
      ? rawUsers
      : createCachedUserLookup({
          delegate: rawUsers,
          cacheStore: activeCacheStore,
          logger: logger || undefined,
        });

  const checkReadiness =
    readinessCheck ??
    (async () => {
      // AI service has no dedicated DB; health is based on process readiness
      return { status: "ready" };
    });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(apiErrorBody(error));
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      fastifyBadRequestCodes.has(String(error.code))
    ) {
      const mapped = invalidInput("Invalid request");
      return reply.code(mapped.statusCode).send(apiErrorBody(mapped));
    }
    request.log.error(
      { event: "app.error", errorCode: "INTERNAL_ERROR", statusCode: 500, err: error },
      "unexpected application error",
    );
    const internal = new AppError(500, "INTERNAL_ERROR", "Internal server error");
    return reply.code(internal.statusCode).send(apiErrorBody(internal));
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Request-Id", request.id);
  });

  app.addHook("onResponse", async (request, reply) => {
    if (
      request.routeOptions.url === "/health" ||
      request.routeOptions.url === "/api/health"
    )
      return;
    const routePath = request.routeOptions.url;
    const path =
      routePath && routePath !== "*"
        ? routePath
        : (request.url.split("?", 1)[0] ?? "/");
    request.log.info(
      {
        event: "http.request.completed",
        method: request.method,
        path,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      "HTTP request completed",
    );
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
      const reason =
        error instanceof Error && error.name === "TimeoutError"
          ? "timeout"
          : "check_failed";
      request.log.error({ event: "app.readiness.failed", reason }, "readiness check failed");
      return reply.code(503).send({ status: "not_ready" });
    }
  };
  app.get("/ready", handleReady);
  app.get("/api/ready", handleReady);

  const activeLock = distributedLock ?? createRuntimeDistributedLock();
  const effectiveRateGate =
    rateGate ?? new DistributedExaoneRateGate(activeLock, activeCacheStore);

  const provider =
    chatProvider ??
    new ExaoneChatProvider({
      apiKey,
      baseUrl,
      fetchImpl,
      rateGate: effectiveRateGate,
    });

  app.register(aiChatRoutes, {
    prefix: "/api/ai/chat",
    users,
    provider,
    streamTimeoutMs,
  });
  app.register(internalEventRoutes, {
    prefix: "/internal/events",
    cacheStore: activeCacheStore,
    internalToken: internalEventToken,
    deadLetterSink,
  });

  return app;
}
