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

export interface AiChatRoutesOptions {
  users: AuthUserLookup;
  provider: AiChatProvider;
}

export const aiChatRoutes: FastifyPluginAsync<AiChatRoutesOptions> = async (
  app,
  options,
) => {
  const requireAdmin = createAdminAuthGuard(options.users);
  const provider = options.provider;

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

      const onClose = () => {
        isClosed = true;
        controller.abort();
      };
      request.raw.on("close", onClose);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Vary: "Cookie",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-Id": request.id,
      });

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
        if (!controller.signal.aborted && !isClosed) {
          const isAppError = error instanceof AppError;
          if (!isAppError) {
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
        if (provider.rateGate) {
          await provider.rateGate.release?.(
            gateResult?.allowed ? gateResult.lease : undefined,
          );
        }
        request.raw.off("close", onClose);
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
