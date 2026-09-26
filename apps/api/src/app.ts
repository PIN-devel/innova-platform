import Fastify from "fastify";
import { createDatabase } from "./db/client.js";
import { createItemRepository, type ItemRepository } from "./db/items.js";
import { itemRoutes } from "./routes/items.js";

export function buildApp({ logger = true, repository }: { logger?: boolean; repository?: ItemRepository } = {}) {
  const app = Fastify({ logger, ajv: { customOptions: { coerceTypes: false } } });
  const items = repository ?? createItemRepository(createDatabase());

  app.get("/", async () => ({ hello: "world" }));
  app.get("/health", async () => ({ status: "ok" }));
  app.register(itemRoutes, { prefix: "/api/items", repository: items });

  return app;
}
