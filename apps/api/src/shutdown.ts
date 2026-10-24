import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export const SHUTDOWN_TIMEOUT_MS = 10_000;

export function registerShutdown(app: FastifyInstance, logger: Logger, timeoutMs = SHUTDOWN_TIMEOUT_MS) {
  let closing = false;
  app.addHook("onSend", async (request, reply, payload) => {
    // Requests already running at shutdown must not leave a keep-alive socket behind.
    if (closing && request.raw.httpVersionMajor === 1) reply.header("Connection", "close");
    return payload;
  });
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    const startedAt = Date.now();
    logger.info({ event: "server.shutdown.started", signal }, "server shutdown started");
    const timer = setTimeout(() => {
      logger.error({ event: "server.shutdown.timeout", signal, durationMs: Date.now() - startedAt }, "server shutdown timed out");
      process.exit(1);
    }, timeoutMs);

    const finish = (code: number) => {
      logger.flush((error) => {
        clearTimeout(timer);
        process.exit(error ? 1 : code);
      });
    };
    void app.close().then(() => {
      logger.info({ event: "server.shutdown.completed", signal, durationMs: Date.now() - startedAt }, "server shutdown completed");
      finish(0);
    }, () => {
      logger.error({ event: "server.shutdown.failed", signal, durationMs: Date.now() - startedAt }, "server shutdown failed");
      finish(1);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
