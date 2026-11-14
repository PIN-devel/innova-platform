import type { FastifyPluginAsync } from "fastify";
import {
  aiChatStreamRequestSchema,
  toValidationErrorDetails,
  type AiChatStreamEvent,
} from "@innova/contracts";
import {
  AppError,
  apiErrorBody,
  createAdminAuthGuard,
  invalidInput,
  type AuthUserLookup,
} from "@innova/auth-kit";
import type { AiChatProvider } from "../providers/types.js";
import { RateLimitError } from "../providers/rate-gate.js";

const DEFAULT_STREAM_TIMEOUT_MS = 55_000;
const KEEP_ALIVE_INTERVAL_MS = 15_000;

export interface AiChatRoutesOptions {
  users: AuthUserLookup;
  provider: AiChatProvider;
  streamTimeoutMs?: number;
}

export const aiChatRoutes: FastifyPluginAsync<AiChatRoutesOptions> = async (
  app,
  options,
) => {
  const requireAdmin = createAdminAuthGuard(options.users);
  const provider = options.provider;
  const streamTimeoutMs = options.streamTimeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS;

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store").header("Vary", "Cookie");
    if (request.headers["sec-fetch-site"] === "cross-site") {
      throw new AppError(403, "FORBIDDEN", "Cross-site requests are not allowed");
    }
  });

  app.post(
    "/stream",
    {
      preHandler: requireAdmin,
    },
    async (request, reply) => {
      const parsed = aiChatStreamRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw invalidInput(
          "요청 데이터가 올바르지 않습니다.",
          toValidationErrorDetails(parsed.error, request.body),
        );
      }

      // Check rate gate if provider defines one (e.g. EXAONE 1 RPS)
      const gateResult = provider.rateGate
        ? await provider.rateGate.tryAcquire()
        : undefined;
      if (gateResult && !gateResult.allowed) {
        return reply
          .header("retry-after-ms", String(gateResult.retryAfterMs))
          .header(
            "Retry-After",
            String(Math.ceil(gateResult.retryAfterMs / 1_000)),
          )
          .code(429)
          .send(apiErrorBody(new RateLimitError(gateResult.retryAfterMs)));
      }

      const controller = new AbortController();
      let isClosed = false;
      let isTimedOut = false;

      const onClose = () => {
        if (reply.raw.writableEnded) return;
        isClosed = true;
        controller.abort();
      };
      request.raw.on("close", onClose);
      reply.raw.on("close", onClose);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Vary: "Cookie",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": request.id,
      });
      reply.raw.flushHeaders?.();
      reply.raw.write(": stream-open\n\n");

      const keepAliveTimer = setInterval(() => {
        if (!controller.signal.aborted && !isClosed && !reply.raw.writableEnded) {
          reply.raw.write(": keep-alive\n\n");
        }
      }, KEEP_ALIVE_INTERVAL_MS);
      keepAliveTimer.unref?.();

      const timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        controller.abort();
      }, streamTimeoutMs);
      timeoutTimer.unref?.();

      try {
        for await (const event of provider.streamChat({
          messages: parsed.data.messages,
          reasoningEffort: parsed.data.reasoningEffort,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted || isClosed) break;
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (error) {
        if (!isTimedOut && !controller.signal.aborted && !isClosed) {
          const isAppError = error instanceof AppError;
          if (isAppError) {
            request.log.warn(
              {
                event: "ai.stream.upstream_error",
                errorCode: error.code,
                statusCode: error.statusCode,
                ...(error instanceof RateLimitError && error.diagnosticContext
                  ? { upstream: error.diagnosticContext }
                  : {}),
              },
              error.message,
            );
          } else {
            request.log.error(
              {
                event: "ai.stream.error",
                errorCode: "INTERNAL_ERROR",
                err:
                  error instanceof Error
                    ? { name: error.name, message: error.message }
                    : undefined,
              },
              "unexpected AI stream error",
            );
          }
          const errorEvent: AiChatStreamEvent = {
            type: "error",
            code:
              error instanceof RateLimitError
                ? "RATE_LIMITED"
                : isAppError
                  ? error.code
                  : "INTERNAL_ERROR",
            message: isAppError
              ? error.message
              : "AI 서비스 내부 오류가 발생했습니다.",
            retryAfterMs:
              error instanceof RateLimitError ? error.retryAfterMs : undefined,
          };
          reply.raw.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        }
      } finally {
        clearTimeout(timeoutTimer);
        clearInterval(keepAliveTimer);
        if (isTimedOut && !isClosed && !reply.raw.writableEnded) {
          request.log.warn(
            { event: "ai.stream.timeout", streamTimeoutMs },
            "AI stream timed out before proxy cutoff",
          );
          const timeoutEvent: AiChatStreamEvent = {
            type: "error",
            code: "INTERNAL_ERROR",
            message:
              "AI 추론 시간이 응답 제한 시간(55초)을 초과하여 중단되었습니다. 추론 강도를 '낮음(low)' 또는 '보통(medium)'으로 낮추어 다시 시도해 주세요.",
          };
          reply.raw.write(`data: ${JSON.stringify(timeoutEvent)}\n\n`);
        }
        if (provider.rateGate) {
          await provider.rateGate.release?.(
            gateResult?.allowed ? gateResult.lease : undefined,
          );
        }
        request.raw.off("close", onClose);
        reply.raw.off("close", onClose);
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
        request.log.info(
          {
            event: "http.request.completed",
            method: request.method,
            path: "/api/ai/chat/stream",
            statusCode: 200,
            durationMs: reply.elapsedTime,
          },
          "HTTP request completed",
        );
      }
    },
  );
};
