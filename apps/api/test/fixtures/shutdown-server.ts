import { buildApp } from "../../src/app.js";
import { createApplicationLogger } from "../../src/logger.js";
import { registerShutdown } from "../../src/shutdown.js";

const logger = createApplicationLogger();
const app = buildApp({
  logger,
  jwtSecret: "synthetic-shutdown-secret-at-least-32-characters",
  examRepository: { async find() { return undefined; }, async create() { throw new Error("unused"); } },
  userRepository: { async findById() {}, async findByEmail() {}, async create() {}, async findPending() { return []; }, async approvePending() {} },
  readinessCheck: async () => {},
});
let release: (() => void) | undefined;
app.get("/slow", async () => {
  process.send?.({ type: "request.started" });
  await new Promise<void>((resolve) => { release = resolve; });
  return { finished: true };
});
app.get("/hang", async () => {
  process.send?.({ type: "request.started" });
  await new Promise(() => {});
});
process.on("message", (message) => { if (message === "release") release?.(); });
if (process.argv[2] === "close-failure") {
  app.addHook("onClose", async () => { throw new Error("synthetic close failure"); });
}
registerShutdown(app, logger, 500);
const address = await app.listen({ port: 0, host: "127.0.0.1" });
process.send?.({ type: "listening", address });
