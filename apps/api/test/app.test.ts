import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import type { ItemRepository } from "../src/db/items.js";

function createTestRepository(): ItemRepository {
  const items = new Map([
    ["item-1", { id: "item-1", name: "Notebook" }],
    ["item-2", { id: "item-2", name: "Pen" }],
    ["item-3", { id: "item-3", name: "Desk lamp" }],
  ]);

  return {
    async list() { return [...items.values()]; },
    async find(id) { return items.get(id); },
    async create(name) {
      const item = { id: randomUUID(), name };
      items.set(item.id, item);
      return item;
    },
    async update(id, name) {
      if (!items.has(id)) return undefined;
      const item = { id, name };
      items.set(id, item);
      return item;
    },
    async remove(id) { return items.delete(id); },
  };
}

test("basic routes and item CRUD", async (t) => {
  const app = buildApp({ logger: false, repository: createTestRepository() });
  t.after(() => app.close());

  const root = await app.inject({ method: "GET", url: "/" });
  assert.equal(root.statusCode, 200);
  assert.deepEqual(root.json(), { hello: "world" });

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.deepEqual(health.json(), { status: "ok" });

  const initial = await app.inject({ method: "GET", url: "/api/items" });
  assert.equal(initial.json().length, 3);

  const created = await app.inject({ method: "POST", url: "/api/items", payload: { name: "  Ruler  " } });
  assert.equal(created.statusCode, 201);
  const item = created.json() as { id: string; name: string };
  assert.equal(item.name, "Ruler");

  const read = await app.inject({ method: "GET", url: `/api/items/${item.id}` });
  assert.deepEqual(read.json(), item);

  const updated = await app.inject({ method: "PUT", url: `/api/items/${item.id}`, payload: { name: "Pencil" } });
  assert.equal(updated.statusCode, 200);
  assert.deepEqual(updated.json(), { id: item.id, name: "Pencil" });

  const deleted = await app.inject({ method: "DELETE", url: `/api/items/${item.id}` });
  assert.equal(deleted.statusCode, 204);

  const missing = await app.inject({ method: "GET", url: `/api/items/${item.id}` });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { message: "Item not found" });
});

test("rejects invalid item names", async (t) => {
  const app = buildApp({ logger: false, repository: createTestRepository() });
  t.after(() => app.close());

  for (const payload of [{ name: "   " }, { name: 123 }, {}]) {
    const response = await app.inject({ method: "POST", url: "/api/items", payload });
    assert.equal(response.statusCode, 400);
  }
});
