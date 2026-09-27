import "dotenv/config";
import { buildApp } from "./app.js";
import { createApplicationLogger } from "./logger.js";

const port = Number(process.env.PORT ?? 3000);
const environment = process.env.NODE_ENV ?? "development";
const host = process.env.HOST ?? (environment === "production" ? "0.0.0.0" : "127.0.0.1");
let logger: ReturnType<typeof createApplicationLogger>;

try {
  logger = createApplicationLogger();
} catch (error) {
  const fallbackLogger = createApplicationLogger({ level: "info" });
  fallbackLogger.fatal({ event: "server.start.failed", host, port, environment, err: error }, "server logger configuration failed");
  process.exit(1);
}

logger.info({ event: "server.starting", host, port, environment }, "server starting");

try {
  const app = buildApp({ logger });
  await app.listen({ port, host });
  logger.info({ event: "server.started", host, port, environment }, "server started");
} catch (error) {
  logger.fatal({ event: "server.start.failed", host, port, environment, err: error }, "server failed to start");
  process.exit(1);
}
